const _t = require('../utils/fluent.bundle.js');

module.exports = class {
	data() {
		return {
			permalink: data => `${data.page.filePathStem}.vcf`,
		};
	}


	render(data) {
		const rows = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			`N:${_t('last-name', data.lang)};${_t('first-name', data.lang)};;;`,
			`FN:${_t('name', data.lang)}`,
			`ORG:ihappymama.ru`,
			`TITLE:${_t('job', data.lang)}`,
			`EMAIL;PREF;WORK:${data.email}`,
			`URL;type=pref:${data.env.URL}`,
		];

		const allLinks = [...data.links.works, ...data.links.contacts];

		rows.push(...allLinks.map(link => `URL:${link}`));
		rows.push(`END:VCARD`);
		return rows.join('\n');
	}
};
