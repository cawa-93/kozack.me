const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

module.exports = function() {
	const envConfig = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env.local')));
	for (const k in envConfig) {
		process.env[k] = envConfig[k];
	}

	return {
		URL: process.env.URL || 'http://localhost:8080',
		FLIP_CARD: JSON.parse(process.env.FLIP_CARD),
	};
};

