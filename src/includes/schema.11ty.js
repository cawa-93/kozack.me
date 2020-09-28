module.exports = ({config}) => {

	const sideProfiles = [
		'https://www.facebook.com/alex.kozack',
		'https://qna.habr.com/user/Kozack',
		'https://shikimori.org/Alex%20Kozack',
		'https://shikimori.one/Alex%20Kozack',
		'https://shikimori.one/Alex+Kozack',
		'https://shikimori.org/Alex+Kozack',
		'https://wordpress.org/support/users/cawa-93/',
		'https://ru.wordpress.org/support/users/cawa-93/',
		'https://addons.mozilla.org/uk/firefox/user/13317680/',
		'https://codesandbox.io/u/cawa-93',
		'https://www.linkedin.com/in/alex-kozack-3a62a665/',
		'https://www.youtube.com/channel/UCqCVff90SH3jpMDYSP-gDXw'
	]

	const base = {
		'name': config.name,
		'email': config.email,
		'sameAs': [...config.links, ...sideProfiles],
		'url': config.site,
	};

	const image = `${config.site}${config.avatar.src}`;

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
			'jobTitle': config.jobTitle,
		},
	};

	return JSON.stringify(schema)
};
