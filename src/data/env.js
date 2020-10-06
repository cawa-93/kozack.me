require('dotenv').config()

module.exports = {
	URL: process.env.URL || 'http://localhost:8080',
	FLIP_CARD: JSON.parse(process.env.FLIP_CARD),
}

