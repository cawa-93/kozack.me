class Link {
	constructor({url, label, icon, type}) {
		this.url = url;
		this.label = label;
		this.icon = icon;
		this.type = type;
	}


	toString() {
		return this.url;
	}


	toJSON() {
		return this.url;
	}
}



const GitHub = new Link({
	type: 'work',
	url: 'https://github.com/cawa-93',
	label: 'Follow on GitHub',
	icon: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12C2,16.42 4.87,20.17 8.84,21.5C9.34,21.58 9.5,21.27 9.5,21C9.5,20.77 9.5,20.14 9.5,19.31C6.73,19.91 6.14,17.97 6.14,17.97C5.68,16.81 5.03,16.5 5.03,16.5C4.12,15.88 5.1,15.9 5.1,15.9C6.1,15.97 6.63,16.93 6.63,16.93C7.5,18.45 8.97,18 9.54,17.76C9.63,17.11 9.89,16.67 10.17,16.42C7.95,16.17 5.62,15.31 5.62,11.5C5.62,10.39 6,9.5 6.65,8.79C6.55,8.54 6.2,7.5 6.75,6.15C6.75,6.15 7.59,5.88 9.5,7.17C10.29,6.95 11.15,6.84 12,6.84C12.85,6.84 13.71,6.95 14.5,7.17C16.41,5.88 17.25,6.15 17.25,6.15C17.8,7.5 17.45,8.54 17.35,8.79C18,9.5 18.38,10.39 18.38,11.5C18.38,15.32 16.04,16.16 13.81,16.41C14.17,16.72 14.5,17.33 14.5,18.26C14.5,19.6 14.5,20.68 14.5,21C14.5,21.27 14.66,21.59 15.17,21.5C19.14,20.16 22,16.42 22,12A10,10 0 0,0 12,2Z"/></svg>',
});

const Habr = new Link({
	type: 'work',
	url: 'https://habr.com/users/kozack',
	label: 'Articles on Habr',
	icon: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="m14.68402,7.09114c-1.78656,-0.12905 -3.51322,0.67301 -4.56701,2.12145l0,-9.21259l-5.11701,0l0,23.5717l5.11701,0l0,-8.6233c0,-2.0626 1.17858,-3.0447 2.6027,-3.0447c1.5518,0 2.53399,1.0509 2.53399,2.9464l0,8.7216l5.117,0l0,-10.5287c0,-3.71255 -2.4849,-5.95186 -5.68668,-5.95186z" /></svg>',
});

const Facebook = new Link({
	type: 'contact',
	label: 'Facebook Messenger',
	url: 'https://m.me/alex.kozack',
	icon: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12,2C6.36,2 2,6.13 2,11.7C2,14.61 3.19,17.14 5.14,18.87C5.3,19 5.4,19.22 5.41,19.44L5.46,21.22C5.5,21.79 6.07,22.16 6.59,21.93L8.57,21.06C8.74,21 8.93,20.97 9.1,21C10,21.27 11,21.4 12,21.4C17.64,21.4 22,17.27 22,11.7C22,6.13 17.64,2 12,2M18,9.46L15.07,14.13C14.6,14.86 13.6,15.05 12.9,14.5L10.56,12.77C10.35,12.61 10.05,12.61 9.84,12.77L6.68,15.17C6.26,15.5 5.71,15 6,14.54L8.93,9.87C9.4,9.14 10.4,8.95 11.1,9.47L13.44,11.23C13.66,11.39 13.95,11.39 14.16,11.23L17.32,8.83C17.74,8.5 18.29,9 18,9.46Z" /></svg>',
});

const Telegram = new Link({
	type: 'contact',
	url: 'https://t.me/kozack',
	label: 'Telegram',
	icon: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M9.78,18.65L10.06,14.42L17.74,7.5C18.08,7.19 17.67,7.04 17.22,7.31L7.74,13.3L3.64,12C2.76,11.75 2.75,11.14 3.84,10.7L19.81,4.54C20.54,4.21 21.24,4.72 20.96,5.84L18.24,18.65C18.05,19.56 17.5,19.78 16.74,19.36L12.6,16.3L10.61,18.23C10.38,18.46 10.19,18.65 9.78,18.65Z" /></svg>',
});

const links = [
	GitHub,
	Habr,
	Telegram,
	Facebook,
];

module.exports = function() {
	return {
		name: 'Alex Kozack',
		jobTitle: 'Full-stack web developer',
		site: process.env.URL || 'https://localhost:8080',
		email: 'x73blk4om@relay.firefox.com',
		avatar: {
			src: '/images/avatar-origin.png',
		},
		links,
		skills: [
			'JavaScript',
			'TypeScript',
			'VueJs',
			'NodeJs',
			'PHP',
			'WordPress',
			'Git',
		],
	};
};
