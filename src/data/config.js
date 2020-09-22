const contacts = [
	{
		type: 'GitHub', url: 'https://github.com/cawa-93', label: 'GitHub profile',
		picture: {
			srcset: '/images/GitHub-origin.png',
			sources: {
				avif: {srcset: ''},
				webp: {srcset: ''},
				png: {srcset: ''},
			},
		},
	},
	{
		type: 'Telegram', url: 'https://t.me/kozack', label: 'Telegram profile',
		picture: {
			srcset: '/images/Telegram-origin.png',
			sources: {
				avif: {srcset: ''},
				webp: {srcset: ''},
				png: {srcset: ''},
			},
		},
	},
	{
		type: 'Habr', url: 'https://habr.com/ru/users/kozack/posts', label: 'Blog on Habr',
		picture: {
			srcset: '/images/Habr-origin.png',
			alt: '',
			sources: {
				avif: {srcset: ''},
				webp: {srcset: ''},
				png: {srcset: ''},
			},
		},
	},
	{
		type: 'Facebook', url: 'https://fb.com/alex.kozack', label: 'Facebook profile',
		picture: {
			srcset: '/images/Facebook-origin.png',
			alt: '',
			sources: {
				avif: {srcset: ''},
				webp: {srcset: ''},
				png: {srcset: ''},
			},
		},
	},
];

const contactUrls = contacts.map(i => i.url);
//
//
// async function getImageSources(imagePattern, originSize) {
// 	const path = require('path');
// 	const glob = require('glob');
// 	// const originExtension = path.extname(imagePath);
//
// 	// const absoluteImagePath = path.resolve('src', '.' + imagePath);
// 	// const pattern = absoluteImagePath.replace(new RegExp(`\\${originExtension}$`), '') + '-*';
//
// 	console.log(imagePattern);
//
// 	const sources = new Map();
//
// 	const r = glob.sync(imagePattern);
//
// 	const FileType = require('file-type');
// 	for (const image of r) {
// 		const {mime: type} = await FileType.fromFile(image);
// 		if (!sources.has(type)) {
// 			sources.set(type, []);
// 		}
//
// 		const name = '/images/' + path.basename(image);
//
// 		const size = parseInt(name.match(/-(\d+)\./)[1], 10);
// 		const scale = size / originSize;
// 		const srcset = sources.get(type);
// 		srcset.push({src: name, scale});
// 		sources.set(type, srcset);
// 	}
//
// 	// .map(p => {
// 	// 	const name = path.basename(p);
// 	// 	const extension = path.extname(p);
// 	// 	const size = parseInt(name.match(/-(\d+)\./)[1], 10);
// 	// 	return {p, name, extension, size};
// 	// })
//
// 	console.log(sources);
//
// 	return sources;
//
// }

module.exports = function() {
	return {
		name: 'Alex Kozack',
		jobTitle: 'Full-stack web developer',
		site: 'https://localhost:8080',
		avatar: {
			src: '/images/avatar-origin.png',
		},
		contacts,
		contactUrls,
	};
};
