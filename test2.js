var dgram = require("dgram");

var client = dgram.createSocket("udp4");
var PORT = process.env.UDP_PORT||"4000";
var IPadress = process.env.UDP_IP ||"192.168.4.52";
var ID = process.env.RL_ID||"0037003047415706";
var IDSZ = "0037003047415706";
var PWD = "1111"

var mqtt_temp_message = "";
var header  = Buffer.from(
				[ 0xFD, 0xFD,   // Beginn des Pakets
				 0x02,          // Protokolltyp
				 0x10,          // ID Blockgroesse
				 ]
				);
var IDbuf = Buffer.from(ID);
var PWDsizebuf = Buffer.from([0x04]);
var PWDbuf = Buffer.from(PWD);
var writeFlevelbuf = Buffer.from('init');
var writeModebuf = Buffer.from('init');

function message(topic, message){
	//message ist Buffer
	//console.log(topic);
	if(topic.includes("fan_level")){
		// construct fan_level write message
		var dataarr = new Uint8Array(1);
		dataarr[0] = parseInt(message.toString());
		var writeFlevelDatabuf = Buffer.from([0x02, 0x02]);
		writeFlevelbuf = Buffer.concat([header, IDbuf, PWDsizebuf, PWDbuf, writeFlevelDatabuf, Buffer.from(dataarr.buffer)]);
		var checksum_writeFlevel = calcchecksum(writeFlevelbuf);
		writeFlevelbuf = Buffer.concat([writeFlevelbuf,checksum2buffer(checksum_writeFlevel)]);
		console.log(writeFlevelbuf);
		client.send(writeFlevelbuf, PORT, IPadress);
		console.log("fan level case");
	}
	else if(topic.includes("mode")){
		// construct Mode write message
		var error = 0;
		var modedataarr = new Uint8Array(1);
								if(message.toString() == "ventilation"){modedataarr[0] = 0;}
								else if(message.toString() == "regeneration"){modedataarr[0] = 1;}
								else if(message.toString() == "supplyair"){modedataarr[0] = 2;}
		else {
			console.log("bad mode command", message.toString());
			error = 1;
			}
		if(error == 0){
			var writeModeDatabuf = Buffer.from([0x02, 0xB7]);
			writeModebuf = Buffer.concat([header, IDbuf, PWDsizebuf, PWDbuf, writeModeDatabuf, Buffer.from(modedataarr.buffer)]);
			var checksum_writeMode = calcchecksum(writeModebuf);
			writeModebuf = Buffer.concat([writeModebuf,checksum2buffer(checksum_writeMode)]);
			console.log(writeModebuf);
			client.send(writeModebuf, PORT, IPadress);
			}
		console.log("mode case");
	}
	else{
		console.log(message.toString())
	}
}



// UDP
client.on("message", function(message, rinfo) {
	console.log("received: ", message, rinfo);
	datalen = rinfo.size - 24 - message.readInt8(20);
	console.log("datalen = " + datalen);
	databuf = message.subarray(20+message.readInt8(20)+2, -2) //20 byte upfront, pwd length, pwd, func
	console.log("databuf = " + JSON.stringify(databuf));
	for (let i=0; i < datalen; i+=2){
		console.log("data = ", databuf[i]);
		switch(databuf[i]){
			case(1):
				console.log("Bathroom/status =  ", databuf[i+1]);
				//mqtt_client.publish('/rl/Bathroom/status', databuf[i+1]?"on":"off", { qos: 0, retain: true });
				break;
			case(2):
				console.log("Bathroom/fan_level = ", databuf[i+1]);
				//mqtt_client.publish('/rl/Bathroom/fan_level', databuf[i-1]?databuf[i+1].toString():"0", { qos: 0, retain: true });
				break;
			case(37): //0x25
				console.log("Bathroom/humidity = ", databuf[i+1]);
				//mqtt_client.publish('/rl/Bathroom/humidity', databuf[i+1].toString(), { qos: 0, retain: true });
				break;
			case(136): //0x88
				console.log("Bathroom/filter = ", databuf[i+1]);
				//mqtt_client.publish('/rl/Bathroom/humidity', databuf[i+1].toString(), { qos: 0, retain: true });
				break;
			case(183): //0xB7
				if(databuf[i+1].toString() == "0"){mqtt_temp_message = "ventilation";}
				else if(databuf[i+1].toString() == "1"){mqtt_temp_message = "regeneration";}
				else if(databuf[i+1].toString() == "2"){mqtt_temp_message = "supplyair";}
				else {mqtt_temp_message = "error"+ databuf[i+1].toString();} 
				console.log("tmp message = " + mqtt_temp_message);
				console.log("Bathroom/mode = ", databuf[i+1])
				//mqtt_client.publish('/rl/Bathroom/mode', mqtt_temp_message, { qos: 0, retain: true });
																break;
			default:
				console.log("unknown ID");
				console.log(message, rinfo)
		}
	}

});

client.bind(PORT);

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


// setup UDP messages
//var Databuf = Buffer.from([0x01, 0xb9, 0x92, 0xa3]);
var Databuf = Buffer.from([0x01, 0x01, 0x02, 0x25, 0x88, 0xB7]);

var list = [header, IDbuf, PWDsizebuf, PWDbuf, Databuf];
var intbuff = Buffer.concat(list);

//calculate checksum
let checksum = calcchecksum(intbuff);
//const arr = new Uint8Array(2);
//arr[0] = checksum%256;
//arr[1] = checksum/256;
//const checksumbuff = Buffer.from(arr.buffer);

var list2 = [intbuff,checksum2buffer(checksum)];
var getbuff = Buffer.concat(list2);
console.log(getbuff);


// <Buffer fd fd 02 10 30 30 34 41 30 30 32 45 34 33 35 33 35 33 30 42 04 31 31 31 31 01 01 02 de 00>
//client.send(getbuff, PORT, IPadress);

message("mode", "regeneration");

//from App
//fd fd 02 10 30 30 34 45 30 30 33 35 34 33 35 33 35 33 30 42 04 31 31 31 31 01 b9 92 a3 13 06
//fd fd 02 10 30 30 34 41 30 30 32 45 34 33 35 33 35 33 30 42 04 31 31 31 31 01 b9 92 a3 1e 06