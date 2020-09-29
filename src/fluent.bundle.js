const {FluentBundle, FluentResource} = require('@fluent/bundle');
const fs = require('fs');

const cache = new Map();


function getBundle(locale) {
	if (!cache.has(locale)) {
		let bundle = new FluentBundle(locale);

		let resource = new FluentResource(fs.readFileSync(`./src/l10n/${locale}.ftl`, {encoding: 'utf-8'}));
		let errors = bundle.addResource(resource);
		if (errors.length) {
			// Syntax errors are per-message and don't break the whole resource
			errors.forEach(console.error);
		}

		cache.set(locale, bundle);
	}

	return cache.get(locale);
}


function getMessage(id, locale = 'en', args = {}) {
	const bundle = getBundle(locale);
	let message = bundle.getMessage(id);

	if (!message && locale !== 'en') {
		message = getMessage(id, 'en', args);
	}

	return message;
}


function getFormattedMessage(id, locale = 'en', args = {}) {
	const bundle = getBundle(locale);
	const message = getMessage(id, locale, args);

	if (!message) {
		return;
	}
	const formattedMessage = {
		value: bundle.formatPattern(message.value, args),
		toString() {
			return this.value;
		},
		toJSON() {
			return this.value;
		},
	};

	for (const key in message.attributes) {
		formattedMessage[key] = bundle.formatPattern(message.attributes[key], args);
	}

	return formattedMessage;
}


module.exports = function _(id, locale = 'en', attribute = null, args = {}) {

	const message = getFormattedMessage(id, locale, args);
	if (!attribute) {
		return message;
	} else {
		return message[attribute];
	}
};


