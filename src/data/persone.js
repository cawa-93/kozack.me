const name = {
	first: 'Alex',
	last: 'Kozack',

	toString() {
		return this.first + ' ' + this.last
	},

	toJSON() {
		return this.first + ' ' + this.last
	}
}

module.exports = {
	name,
	job: 'Full stack web developer'
}
