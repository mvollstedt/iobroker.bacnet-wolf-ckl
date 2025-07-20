'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load BACnet library (you need to install it first: npm install node-bacnet)
// Note: node-bacnet might have native dependencies, ensure your build environment is set up.
const bacnet = require('node-bacnet');

class BacnetWolfCkl extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: 'bacnet-wolf-ckl',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.bacnetClient = null;
        this.pollTimer = null;
        this.knownObjects = {}; // Cache for BACnet object types
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.log.info('Adapter starting up...');

        // Read adapter configuration
        const ipAddress = this.config.ipAddress || '172.16.0.1';
        const port = this.config.port || 47808;
        const deviceInstance = this.config.deviceInstance || 77000;
        const pollInterval = this.config.pollInterval || 5000; // milliseconds

        this.log.info(`Connecting to BACnet device at ${ipAddress}:${port}, Device Instance: ${deviceInstance}`);

        // Initialize BACnet client
        this.bacnetClient = new bacnet({
            port: port,
            // You might need to specify an interface if you have multiple network interfaces
            // interface: '0.0.0.0'
        });

        // Handle BACnet client errors
        this.bacnetClient.on('error', (err) => {
            this.log.error(`BACnet client error: ${err.message}`);
            this.setState('info.connection', false, true);
        });

        this.bacnetClient.on('iAm', (device) => {
            this.log.info(`Found BACnet device: ${device.deviceIdentifier.instance} at ${device.address}`);
            if (device.deviceIdentifier.instance === deviceInstance) {
                this.log.info(`Connected to target BACnet device: ${device.deviceIdentifier.instance}`);
                this.setState('info.connection', true, true);
                this.startPolling();
            } else {
                this.log.warn(`Found other BACnet device ${device.deviceIdentifier.instance}, not our target ${deviceInstance}`);
            }
        });

        this.bacnetClient.on('whoIs', (data) => {
            this.log.debug(`Received WhoIs: ${JSON.stringify(data)}`);
        });

        // Discover devices
        this.bacnetClient.whoIs();

        // Create ioBroker states based on configured bacnetObjects
        if (this.config.bacnetObjects && Array.isArray(this.config.bacnetObjects)) {
            for (const obj of this.config.bacnetObjects) {
                const stateId = obj.name.replace(/[^a-zA-Z0-9_.-]/g, '_'); // Sanitize name for ioBroker state ID
                await this.setObjectNotExistsAsync(stateId, {
                    type: 'state',
                    common: {
                        name: obj.name,
                        type: obj.ioBrokerType || 'mixed', // Default to mixed if not specified
                        role: obj.readWrite === 'R/W' ? 'value' : 'indicator', // Basic role assignment
                        read: obj.readWrite.includes('R'),
                        write: obj.readWrite.includes('W'),
                        unit: obj.unit || '',
                        desc: obj.description || '',
                        def: obj.ioBrokerType === 'number' ? 0 : (obj.ioBrokerType === 'boolean' ? false : null)
                    },
                    native: {
                        bacnetObjectType: obj.bacnetObjectType,
                        bacnetInstance: obj.bacnetInstance
                    },
                });
                // Subscribe to state changes if writable
                if (obj.readWrite.includes('W')) {
                    this.subscribeStates(stateId);
                }
            }
        }

        // Ensure connection state is initially false
        this.setState('info.connection', false, true);
    }

    /**
     * Start periodic polling of BACnet objects.
     */
    startPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        this.pollTimer = setInterval(async () => {
            this.log.debug('Polling BACnet objects...');
            for (const obj of this.config.bacnetObjects) {
                if (obj.readWrite.includes('R')) { // Only poll readable objects
                    const objectType = this.getBacnetObjectType(obj.bacnetObjectType);
                    if (objectType === undefined) {
                        this.log.warn(`Unknown BACnet object type: ${obj.bacnetObjectType} for ${obj.name}. Skipping poll.`);
                        continue;
                    }
                    this.readBacnetObject(objectType, obj.bacnetInstance, obj.name);
                }
            }
        }, this.config.pollInterval || 5000);
    }

    /**
     * Read a single BACnet object and update ioBroker state.
     * @param {number} objectType BACnet object type enum.
     * @param {number} objectInstance BACnet object instance.
     * @param {string} stateName IoBroker state name to update.
     */
    async readBacnetObject(objectType, objectInstance, stateName) {
        try {
            const objectIdentifier = {
                type: objectType,
                instance: objectInstance
            };
            const properties = [{ id: bacnet.enum.PropertyIdentifier.presentValue }];

            this.bacnetClient.readProperty(
                this.config.ipAddress,
                objectIdentifier,
                bacnet.enum.PropertyIdentifier.presentValue,
                { arrayIndex: bacnet.enum.PropertyArrayIndex.all },
                (err, value) => {
                    if (err) {
                        this.log.warn(`Failed to read ${stateName} (Type: ${objectType}, Instance: ${objectInstance}): ${err.message}`);
                        return;
                    }

                    // For Multi-state Value, the presentValue is an object with value property
                    let stateValue = value.value;
                    if (objectType === bacnet.enum.ObjectTypes.multiStateValue ||
                        objectType === bacnet.enum.ObjectTypes.multiStateOutput ||
                        objectType === bacnet.enum.ObjectTypes.multiStateInput) {
                        stateValue = value.value.value;
                    }

                    this.log.debug(`Read ${stateName}: ${stateValue}`);
                    this.setState(stateName.replace(/[^a-zA-Z0-9_.-]/g, '_'), stateValue, true); // Update ioBroker state
                }
            );
        } catch (e) {
            this.log.error(`Error reading BACnet object ${stateName}: ${e.message}`);
        }
    }

    /**
     * Helper to get BACnet object type enum from string.
     * @param {string} typeString Short BACnet type string (e.g., "AI", "AV", "MV", "BO").
     * @returns {number | undefined} BACnet object type enum.
     */
    getBacnetObjectType(typeString) {
        if (this.knownObjects[typeString]) {
            return this.knownObjects[typeString];
        }

        switch (typeString.toUpperCase()) {
            case 'AI': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.analogInput;
            case 'AO': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.analogOutput;
            case 'AV': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.analogValue;
            case 'BI': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.binaryInput;
            case 'BO': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.binaryOutput;
            case 'BV': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.binaryValue;
            case 'MI': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.multiStateInput;
            case 'MO': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.multiStateOutput;
            case 'MV': return this.knownObjects[typeString] = bacnet.enum.ObjectTypes.multiStateValue;
            // Add more types as needed from the BACnet specification
            default: return undefined;
        }
    }

    /**
     * Is called when a subscribed state changes.
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state && !state.ack) { // Only react to changes from ioBroker (e.g., from UI or script)
            this.log.debug(`State ${id} changed: ${state.val} (ack = ${state.ack})`);

            // Find the corresponding BACnet object configuration
            const objConfig = this.config.bacnetObjects.find(obj =>
                id.endsWith(obj.name.replace(/[^a-zA-Z0-9_.-]/g, '_')) && obj.readWrite.includes('W')
            );

            if (objConfig) {
                const objectType = this.getBacnetObjectType(objConfig.bacnetObjectType);
                if (objectType === undefined) {
                    this.log.warn(`Unknown BACnet object type: ${objConfig.bacnetObjectType} for ${objConfig.name}. Cannot write.`);
                    return;
                }
                this.writeBacnetObject(objectType, objConfig.bacnetInstance, state.val, id);
            } else {
                this.log.warn(`State ${id} is not configured as a writable BACnet object or not found.`);
            }
        }
    }

    /**
     * Write a value to a BACnet object.
     * @param {number} objectType BACnet object type enum.
     * @param {number} objectInstance BACnet object instance.
     * @param {any} value Value to write.
     * @param {string} stateId IoBroker state ID to acknowledge after write.
     */
    writeBacnetObject(objectType, objectInstance, value, stateId) {
        try {
            const objectIdentifier = {
                type: objectType,
                instance: objectInstance
            };

            // BACnet values might need specific formatting for writing
            // For multi-state values, it's often an integer representing the state index
            let writeValue = value;
            if (objectType === bacnet.enum.ObjectTypes.multiStateValue ||
                objectType === bacnet.enum.ObjectTypes.multiStateOutput ||
                objectType === bacnet.enum.ObjectTypes.multiStateInput) {
                writeValue = { type: bacnet.enum.ApplicationTags.unsignedInt, value: value };
            } else if (typeof value === 'boolean') {
                 writeValue = { type: bacnet.enum.ApplicationTags.boolean, value: value };
            } else if (typeof value === 'number') {
                writeValue = { type: bacnet.enum.ApplicationTags.real, value: value };
            } else if (typeof value === 'string') {
                 writeValue = { type: bacnet.enum.ApplicationTags.characterString, value: value };
            }


            this.bacnetClient.writeProperty(
                this.config.ipAddress,
                objectIdentifier,
                bacnet.enum.PropertyIdentifier.presentValue,
                { value: [writeValue] }, // Value needs to be an array for writeProperty
                { priority: 8 }, // Default priority, can be configured
                (err, result) => {
                    if (err) {
                        this.log.error(`Failed to write to BACnet object ${objectInstance} (Type: ${objectType}) with value ${value}: ${err.message}`);
                    } else {
                        this.log.info(`Successfully wrote ${value} to BACnet object ${objectInstance} (Type: ${objectType})`);
                        this.setState(stateId, value, true); // Acknowledge the state change
                    }
                }
            );
        } catch (e) {
            this.log.error(`Error writing to BACnet object: ${e.message}`);
        }
    }


    /**
     * Is called when adapter shuts down - callback or promise.
     * @param {function} callback
     */
    onUnload(callback) {
        try {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
            }
            if (this.bacnetClient) {
                this.bacnetClient.close();
            }
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main === module) {
    // Run the adapter as a standalone application
    /** @type {Partial<utils.AdapterOptions>} */
    const adapterOptions = {
        name: 'bacnet-wolf-ckl',
    };
    new BacnetWolfCkl(adapterOptions);
} else {
    // Export the adapter class for tests
    module.exports = BacnetWolfCkl;
}