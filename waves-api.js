var WavesAPI = require('@waves/waves-api');
var crypto = require('crypto');

global.crypto = {
	getRandomValues: function(buffer) {
		crypto.randomFill(buffer, function(err, buf) {
			if (err) throw err;
		});
	}
};

module.exports = WavesAPI;