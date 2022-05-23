'use strict';

var Service;
var Characteristic;
var UUIDGen;
var FakeGatoHistoryService;
var homebridgeAPI;

var dgram = require('dgram');

const { version } = require("./package.json");

// EXAMPLE CONFIG
// {
//     "accessory": "BlaubergVentoV2",
//     "name": "Vento Bedroom",
//     "host": "10.0.0.00",
//     "serialNumber": "000100101234430F"
// },
// {
//     "accessory": "BlaubergVentoHumidity",
//     "name": "Vento Bedroom Humidity Sensor",
//     "host": "10.0.0.00"
// },

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    FakeGatoHistoryService = require("fakegato-history")(homebridge);
    homebridgeAPI = homebridge;
    homebridge.registerAccessory('homebridge-blauberg-vento-v2', 'BlaubergVentoV2', BlaubergVentoV2);
};

function BlaubergVentoV2(log, config) {
    this.log = log;

    this.name            = config.name || 'Blauberg Vento V2';
    this.displayName     = this.name;
    this.humidityName    = config.humidityName || this.name + ' Humidity';
    this.host            = config.host;
    this.port            = config.port || 4000;
    this.serialNumber    = config.serialNumber || '';
    this.updateTimeout   = config.updateTimeout || 30000;
    this.password        = config.password || '1111';
    
    this.header  = Buffer.from(
            [ 0xFD, 0xFD,   // Beginn des Pakets
             0x02,          // Protokolltyp
             0x10,          // ID Blockgroesse
             ]
            );
    this.IDbuf = Buffer.from(this.serialNumber);
    this.PWDsizebuf = Buffer.from([0x04]);
    this.PWDbuf = Buffer.from(this.password);

    this.isFakeGatoEnabled   = config.isFakeGatoEnabled || false;
    this.fakeGatoStoragePath = config.fakeGatoStoragePath || false;

}

BlaubergVentoV2.prototype = {

    udpRequest: function(host, port, payloadMessage, callback, callbackResponse) {
        if(!callback){callback = function(){};}
        if(!callbackResponse){callbackResponse = function(){};}

        var client = dgram.createSocket('udp4');
        var delayTime = Math.floor(Math.random() * 1500) + 1;
        
        //payloadMessage format = Buffer.from([0x01, 0x01, 0x02, 0x25, 0x88, 0xB7])
        var Databuf = payloadMessage;
        
        var list = [this.header, this.IDbuf, this.PWDsizebuf, this.PWDbuf, Databuf];
        var intbuff = Buffer.concat(list);
        
        //calculate checksum
        let checksum = calcchecksum(intbuff);
        var list2 = [intbuff,checksum2buffer(checksum)];
        var getbuff = Buffer.concat(list2);
        
        var message = getbuff;
        
        function calcchecksum(intbuff){
            let checksum = 0;
            for (let i = 2; i < intbuff.length; i++) {
                    // console.log(newbuff[i]);
                    checksum+=intbuff[i];
            }
            //console.log("checksum = " , checksum);
            return checksum;
        }
        
        function checksum2buffer(checksum){
            const arr = new Uint8Array(2);
            arr[0] = checksum%256;
            arr[1] = checksum/256;
            return Buffer.from(arr.buffer);
        }

        setTimeout(function() { 
            client.send(message, 0, message.length, port, host, function(err, bytes) {
                if (err) throw err;
        
                client.on('message', function(msg, rinfo){
                    callbackResponse(msg, rinfo);
                    client.close();
                });
        
                callback(err);
            });
                
        }, delayTime);

    },

    _getStatusData: function(){
        var that = this;
        var payload = Buffer.from([0x01, 0x01, 0x02, 0x25, 0x88, 0xB7]);
        
        this.udpRequest(this.host, this.port, payload, function (error) {
            if(error) {
                that.log.error('_getStatusData failed: ' + error.message);
            }
        }, function (msg, rinfo) {
            datalen = rinfo.size - 24 - message.readInt8(20);
            databuf = message.subarray(20+message.readInt8(20)+2, -2);
            for (let i=0; i < datalen; i+=2){
                console.log("data = ", databuf[i]);
                switch(databuf[i]){
                    case(1):
                        //console.log("Bathroom/status =  ", databuf[i+1]);
                        that.statusCache[1] = databuf[i+1];
                        break;
                    case(2):
                        //console.log("Bathroom/fan_level = ", databuf[i+1]);
                        that.statusCache[2] = databuf[i+1];
                        break;
                    case(37): //0x25
                        //console.log("Bathroom/humidity = ", databuf[i+1]);
                        that.statusCache[37] = databuf[i+1];
                        break;
                    case(136): //0x88
                        //console.log("Bathroom/filter = ", databuf[i+1]);
                        that.statusCache[136] = databuf[i+1];
                        break;
                    case(183): //0xB7
                        //console.log("Bathroom/mode = ", databuf[i+1])
                        that.statusCache[183] = databuf[i+1];
                                                                        break;
                    default:
                        that.log.debug("unknown ID");
                        that.log.debug(message, rinfo)
                }
            }
            
            if(that.statusCache){
                that.addFakeGatoHistoryEntry(that.statusCache[37]);
            }

            that.log.debug('_getStatusData success');
        });

    },

    getFilterStatus: function (targetService, callback, context) {
        var that = this;

        if(that.statusCache && that.statusCache.length){
            callback(null, that.statusCache[136]);
        }else{
            callback(true);
        }
    },


    getCustomSpeed: function (targetService, callback, context) {
        var that = this;

        if(that.statusCache && that.statusCache.length){
            callback(null, Math.round(that.statusCache[2]*20));
        }else{
            callback(true);
        }

    },

    setCustomSpeed: function(targetService, speed, callback, context) {      
        var that = this;
        
        var adjustedSpeed = (Math.round(3/100*speed).toString(16));
        var payload = Buffer.from([0x02, 0x02, adjustedSpeed.buffer]);

        this.udpRequest(this.host, this.port, payload, function(error) {
            if (error) {
                this.log.error('setCustomSpeed failed: ' + error.message);
                this.log('response: ' + response + '\nbody: ' + responseBody);
            
                callback(error);
            } else {
                this.log.info('set speed ' + speed);
                if(that.statusCache && that.statusCache.length){
                    that.statusCache[2] = Math.round(3/100*speed);
                }
            }
            callback();
        }.bind(this));
    },

    getPowerState: function (targetService, callback, context) {
        var that = this;
        if(that.statusCache && that.statusCache.length){
            callback(null, that.statusCache[1]);
        }else{
            callback(true);
        }
    },

    setPowerState: function(targetService, powerState, callback, context){
        var that = this;
       
        var payload = Buffer.from([0x02, 0x01, powerState.buffer]);

        this.udpRequest(this.host, this.port, payload, function (error) {
            if (error) {
                this.log.error('setPowerState failed: ' + error.message);
                this.log('response: ' + response + '\nbody: ' + responseBody);
            
                callback(error);
            } else {
                this.log.info('setPowerState ' + powerState);
                if(that.statusCache && that.statusCache.length){
                    that.statusCache[1] = powerState;
                }
            }
        });
    },

    addFakeGatoHistoryEntry() {
        var that = this;
        if (
          !this.isFakeGatoEnabled 
        ) {
          return;
        }
        this.fakeGatoHistoryService .addEntry({
            time: new Date().getTime() / 1000,
            humidity: that.fanService.getCharacteristic(Characteristic.CurrentRelativeHumidity).value
        });
    },

    getFakeGatoHistoryService() {
        if (!this.isFakeGatoEnabled) {
          return undefined;
        }
        const serialNumber = this.serialNumber ;
        const filename = `fakegato-history_blauberg_humidity_${serialNumber}.json`;
        const path = this.fakeGatoStoragePath || homebridgeAPI.user.storagePath();
        return new FakeGatoHistoryService("room", this, {
          filename,
          path,
          storage: "fs"
        });
    },


    getHumidity: function(targetService, callback, context){
        var that = this;
        if(that.statusCache && that.statusCache.length){
            callback(null,  that.statusCache[37]);
        }else{
            callback(true);
        }
    },

    getFanState: function (targetService, callback, context) {
        var that = this;
        if(that.statusCache && that.statusCache.length){
            callback(null,  that.statusCache[183]);
        }else{
            callback(true);
        }
    },

    setFanState: function(targetService, fanState, callback, context) { 
        var that = this;

        if(1 == fanState){
            var comand = '01';
        }else if(0 == fanState){
            var comand = '00';
        }else if(2 == fanState){
            var comand = '02';
        }

        var payload = Buffer.from([0x02, 0xb7, fanState.buffer]);

        this.udpRequest(this.host, this.port, payload, function(error) {
            if (error) {
                this.log.error('setFanState failed: ' + error.message);            
                callback(error);
            } else {
                this.log.info('setFanState ' + fanState);
                if(that.statusCache && that.statusCache.length){
                    that.statusCache[183] = fanState;
                }
            }
            callback();
        }.bind(this));
        
    },

    identify: function (callback) {
        this.log.debug('[%s] identify', this.displayName);
        callback();
    },

    getServices: function () {
        var that = this;
        this.services = [];

        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Blauberg')
            .setCharacteristic(Characteristic.Model, 'Vento Expert')
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, version)
        ;
        this.services.push(informationService);


        var fanService = new Service.Fanv2(this.name);
        fanService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getPowerState.bind(this, fanService))
            .on('set', this.setPowerState.bind(this, fanService))
        ;
        fanService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getCustomSpeed.bind(this, fanService))
            .on('set', this.setCustomSpeed.bind(this, fanService))
        ;
        fanService
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .on('get', this.getFilterStatus.bind(this, fanService))
        ;
        fanService
            .getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getFanState.bind(this, fanService))
            .on('set', this.setFanState.bind(this, fanService))
        ;
        fanService
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', this.getHumidity.bind(this, fanService))
        ;
    
        that.fanService = fanService;

        this.services.push(fanService);

        var humidityService = new Service.HumiditySensor(this.humidityName);
        humidityService
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', this.getHumidity.bind(this, fanService))
        ;

        this.services.push(humidityService);

        this.fakeGatoHistoryService = this.getFakeGatoHistoryService();
      //  if(this.fakeGatoHistoryService){
            this.services.push(this.fakeGatoHistoryService);
     //   }
      

   
     
        that._getStatusData();
        that.updateInverval = setInterval(function(){
            that._getStatusData();
            that.addFakeGatoHistoryEntry();
        }, that.updateTimeout);
        
        return this.services;
    }
};