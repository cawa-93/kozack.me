const _t = require('../../utils/fluent.bundle.js');

module.exports = class {
	render({links, env, lang, email}) {

		const site = env.URL;

		const sideProfiles = [
			'https://www.facebook.com/alex.kozack',
			'https://qna.habr.com/user/Kozack',
			'https://wordpress.org/support/users/cawa-93/',
			'https://ru.wordpress.org/support/users/cawa-93/',
			'https://addons.mozilla.org/uk/firefox/user/13317680/',
			'https://www.linkedin.com/in/alex-kozack-3a62a665/',
		];

		const allLinks = [...links.works, ...links.contacts];

		const base = {
			'name': _t('name', lang),
			'email': email,
			'sameAs': [...allLinks, ...sideProfiles],
			'url': site,
		};

		const image = `${site}/images/avatar-origin.png`;

		const schema = {
			'@context': 'https://schema.org',
			'@type': 'Organization',
			...base,
			'logo': image,
			'employee': {
				'@context': 'https://schema.org',
				'@type': 'Person',
				...base,
				'image': image,
				'jobTitle': _t('job', lang),
			},
		};

		return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;

	}
};
