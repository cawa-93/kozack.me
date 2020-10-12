module.exports = class {
	render(context) {
		const head = new (require('../includes/head/base.11ty.js'));
		return `
<!DOCTYPE html>
<html lang="${context.lang}">
<head>${head.render(context)}</head>
<body>${context.content}</body>
</html>
`;
	}
};
