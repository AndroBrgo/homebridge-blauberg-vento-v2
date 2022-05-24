var dgram = require('dgram');

var host = "192.168.4.52";
var port = "4000";

	var that = this;
	var payload = '6D6F62696C65' + '01' + '01' + '0D0A';
	var payload = "fdfd021030303337303033303437343135373036043131313101010225b7e904"
	
	udpRequest(host, port, payload, function (error) {
			if(error) {
					that.log.error('_getStatusData failed: ' + error.message);
			}
	}, function (msg, rinfo) {
			that.statusCache = _parseResponseBuffer(msg);
			console.log(that.statusCache);
			if (that.statusCache[19] == 4) {
				console.log(Math.round(that.statusCache[21]/255*100));
			} else {
				console.log(Math.round(that.statusCache[19]*20));
			}
			console.log(Math.round(that.statusCache[21]/255*100));
	});



function udpRequest(host, port, payloadMessage, callback, callbackResponse) {
	if(!callback){callback = function(){};}
	if(!callbackResponse){callbackResponse = function(){};}

	var client = dgram.createSocket('udp4');
	var delayTime = Math.floor(Math.random() * 1500) + 1;
	var message = new Buffer(payloadMessage, 'hex');
	console.log(message);
	
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

}

function _parseResponseBuffer(data){
	return JSON.parse(JSON.stringify(data)).data;
}