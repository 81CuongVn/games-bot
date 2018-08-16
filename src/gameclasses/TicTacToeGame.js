'use strict';

const RichEmbed = require('discord.js').RichEmbed;
const Game = require('./Game.js');
const BoardGameState = require('./BoardGameState.js');
const AIAction = require('./AIAction.js');
const Board = require('./Board.js');
const endGame = require('../internal/endGame.js');

module.exports = TicTacToeGame;

function TicTacToeGame (id, channel) {
	Game.call(this, id, channel, 'tictactoe');
	this.reactions = {'🇦': 0, '🇧': 1, '🇨': 2, '1⃣': 2, '2⃣': 1, '3⃣': 0};
	this.currentState = new BoardGameState(3, 3, id);
}
TicTacToeGame.prototype = Object.create(Game.prototype);
TicTacToeGame.prototype.constructor = TicTacToeGame;

TicTacToeGame.prototype.start = async function (settings) {
	if (settings.players) settings.players.forEach(id => {
		const symbol = ['X', 'O'][Object.keys(this.players).length];
		this.addPlayer(id, {symbol: symbol});
		this.humanPlayerSymbol = symbol;
	});
	this.currentPlayer = Object.assign({}, this.players[Object.keys(this.players)[0]]);
	
	const multiplayer = await this.setMultiPlayer(settings.multiplayer);
	if (!multiplayer) await this.setDifficulty(settings.difficulty);
	await this.setP1GoesFirst(settings.p1GoesFirst);
	this.startPlaying();
};

TicTacToeGame.prototype.promptMultiplayer = async function () {
	const msg = await this.channel.send('Are you going to play against a friend? If so, ping them. If you\'re looking for a game, tap 👁. If not, tap 🇳o.');
	await msg.react('👁');
	await msg.react('🇳');

	let p2;

	const messageCollector = this.channel.createMessageCollector(m => (m.mentions.members.size > 0) && (m.author.id === this.currentPlayer.id), {maxMatches: 1, time: 60 * 1000});
	messageCollector.on('end', async (collected, reason) => {
		if (reason === 'response received') return;
		if (collected.size < 1) return this.sendCollectorEndedMessage(reason);

		let challenged = collected.first().mentions.members.first();
		if (challenged.bot || (challenged.id === this.currentPlayer.id)) {
			await this.channel.send('Yeah, nice try. I\'ll play with you.').catch(console.error);
			p2 = false;
		} else {
			const msg = await this.channel.send(`${challenged}, you have been challenged to play Tic Tac Toe! Tap 👍 to accept.`).catch(console.error);
			await msg.react('👍');
			let filter = (r, user) => (r.emoji.name === '👍') && (user.id === challenged.id);
			const collected = msg.awaitReactions(filter, {maxUsers: 1, time: 60 * 1000});
			if (collected.size < 1) throw new Error(this.sendCollectorEndedMessage(reason).content);
			p2 = challenged.id;
		}
	});

	let filter = (r, user) => ['👁', '🇳'].includes(r.emoji.name) && user.id === this.currentPlayer.id;
	const collectedReactions = await msg.awaitReactions(filter, {maxUsers: 1, time: 60 * 1000});
	messageCollector.stop('response received');
	if (collectedReactions.size < 1) return this.sendCollectorEndedMessage('nobody wanted to join');

	const emoji = collectedReactions.first().emoji.name;
	if (emoji === '👁') {
		const msg = await this.channel.send('Alright, whoever wants to play Tic Tac Toe with this lonely fellow, Tap 🤝 to accept.').catch(console.error);
		await msg.react('🤝');
		const joiner = await msg.awaitReactions((r, user) => (r.emoji.name === '🤝') && ![global.bot.user.id, this.currentPlayer.id].includes(user.id), {maxUsers: 1, time: 60 * 1000});
		if (joiner.size < 1) return this.sendCollectorEndedMessage('nobody wanted to accept');
		p2 = joiner.first().users.first().id;
	} else if (emoji === '🇳') {
		p2 = false;
	}

	return p2;
};

TicTacToeGame.prototype.setMultiPlayer = async function (multiplayer) {
	if (typeof multiplayer === 'undefined')
		multiplayer = await this.promptMultiplayer();
	
	this.multiplayer = multiplayer;
	const p2ID = multiplayer ? multiplayer : global.bot.user.id;
	if (!this.channel.guild.members.get(p2ID)) throw 'That user was not found';
	
	this.addPlayer(p2ID);
	this.players[p2ID] = 'O';
	global.servers[this.channel.guild.id].players[p2ID].tictactoe = this.id;

	this.channel.send(`Players: ${Object.values(this.players).map(p => p.user).join(' and ')}`).catch(console.error);
};

TicTacToeGame.prototype.promptDifficulty = async function () {
	const difficulties = {'🇪': 1, '🇲': 2, '🇭': 3};
	const msg = await this.channel.send('Don\'t worry, I don\'t have friends either. Do you want me to go 🇪asy, 🇲edium, or 🇭ard?');
	for (let r of ['🇪', '🇲', '🇭']) await msg.react(r);
	const collected = await msg.awaitReactions((r, user) => ['🇪', '🇲', '🇭'].includes(r.emoji.name) && (user.id === this.currentPlayer.id), {maxUsers: 1, time: 60 * 1000});
	if (collected.size < 1) return this.sendCollectorEndedMessage();
	return difficulties[collected.first().emoji.name];
};

TicTacToeGame.prototype.setDifficulty = async function (difficulty) {
	if (typeof difficulty === 'undefined')
		difficulty = await this.promptDifficulty();

	this.difficulty = difficulty;
	this.channel.send(`On difficulty ${this.difficulty}.`).catch(console.error);
};

TicTacToeGame.prototype.promptP1GoesFirst = async function () {
	const msg = await this.channel.send('Do you want to go first or second?');
	await msg.react('1⃣');
	await msg.react('2⃣');
	let collected = await msg.awaitReactions((r, user) => ['1⃣', '2⃣'].includes(r.emoji.name) && (user.id === this.currentPlayer.id), {maxUsers: 1, time: 60 * 1000});
	if (collected.size < 1) return this.sendCollectorEndedMessage();
	return collected.has('1⃣');
};

TicTacToeGame.prototype.setP1GoesFirst = async function (p1GoesFirst) {
	if (typeof p1GoesFirst === 'undefined') p1GoesFirst = await this.promptP1GoesFirst();
	if (!p1GoesFirst) {
		this.currentPlayer.symbol = 'O';
		this.humanPlayerSymbol = 'O';
		this.switchPlayer();
		this.currentPlayer.symbol = 'X';
	}
	this.currentState.currentPlayerSymbol = this.currentPlayer.symbol;
	this.channel.send(`${this.currentPlayer.user}, your turn! React with the coordinates of the square you want to move in, e.x. "🇧2⃣".`);
};

TicTacToeGame.prototype.startPlaying = async function () {
	this.status = 'running';
	this.boardMessage = await this.channel.send({embed: this.boardEmbed()});

	if (!this.multiplayer && !(this.currentState.currentPlayerSymbol === this.humanPlayerSymbol)) this.aiMove();
	await this.resetReactions();

	this.resetCollector();
};

TicTacToeGame.prototype.resetCollector = function () {
	let reactionFilter = (r, emoji) => r.message.reactions.get(emoji).users.has(this.currentPlayer.id);
	this.collector = this.boardMessage.createReactionCollector(r => {
		if (this.status !== 'running') return;
		if (this.currentPlayer.id === global.bot.user.id) return;
		if (!this.areReactionsReset(r.message)) return;
		const rowSelected = ['1⃣', '2⃣', '3⃣'].some(row => reactionFilter(r, row));
		const colSelected = ['🇦', '🇧', '🇨'].some(col => reactionFilter(r, col));
		return rowSelected && colSelected;
	}, {time: 5 * 60 * 1000});

	this.collector.on('collect', r => {
		let row = this.reactions[['1⃣', '2⃣', '3⃣'].filter(row => reactionFilter(r, row))[0]];
		let col = this.reactions[['🇦', '🇧', '🇨'].filter(col => reactionFilter(r, col))[0]];

		let ind = row * 3 + col;
		if (this.currentState.board.contents[ind] !== ' ') return this.channel.send('That is not a valid move!').catch(console.error);
		let next = new BoardGameState(this.currentState);
		next.board.contents[ind] = this.currentState.currentPlayerSymbol;
		next.currentPlayerSymbol = switchSymbol(next.currentPlayerSymbol);
		this.advanceTo(next);

		if (!this.multiplayer && !(this.currentState.currentPlayerSymbol === this.humanPlayerSymbol))
			this.aiMove();

		this.resetReactions();
	});

	this.collector.on('end', (collected, reason) => {
		if (reason === 'game over') return;
		this.sendCollectorEndedMessage(reason);
	});
};

TicTacToeGame.prototype.switchPlayer = function () {
	let playerIDs = Object.keys(this.players);
	playerIDs.splice(playerIDs.indexOf(this.currentPlayer.id), 1);
	this.currentPlayer = Object.assign({}, this.players[playerIDs[0]]);
};

TicTacToeGame.prototype.boardEmbed = function () {
	const embed = new RichEmbed()
		.setTimestamp()
		.setTitle('Tic Tac Toe')
		.addField('Players', `${Object.values(this.players).map(p => `${p.user} (${p.symbol})`).join(' vs ')}`)
		.addField('Grid', this.grid())
		.setFooter(`Type ".help ttt" to get help about this function. Game ID: ${this.id}`);
	return embed;
};

TicTacToeGame.prototype.grid = function () {
	let result = '';
	let numbers = ['zero', 'one', 'two', 'three'];
	
	for (let row = 0; row < 3; row++) {
		result += `:${numbers[3 - row]}:`;
		for (let col = 0; col < 3; col++)
			result += Board.emptyCells(this.currentState.board).includes(row * 3 + col) ? ':black_large_square:' : (this.currentState.board.contents[row * 3 + col] === 'X' ? ':regional_indicator_x:' : ':regional_indicator_o:');
		result += '\n';
	}

	result += ':black_large_square:';
	let a = 'a'.charCodeAt(0);
	for (let col = 0; col < 3; col++)
		result += `:regional_indicator_${String.fromCharCode(a + col)}:`;
	return result;
};

TicTacToeGame.prototype.advanceTo = function (state) {
	this.currentState = state;
	this.boardMessage.edit({embed: this.boardEmbed()});
	const term = Board.isTerminal(this.currentState.board);
	this.currentState.result = term ? term : 'running';
	this.switchPlayer();
	if (/(?:X|O)-won|draw/i.test(this.currentState.result)) {
		this.status = 'ended';
		this.channel.send(`${this.currentPlayer} won! GG`).catch(console.error);
		this.collector.stop('game over');
		this.boardMessage.clearReactions();
		endGame(this.channel, this.id, 'tictactoe');
	}
};

TicTacToeGame.prototype.minimaxValue = function (state) {
	const term = Board.isTerminal(state.board);
	if (term) {
		state.result = term ? term : 'running';
		return this.score(state);
	}

	let stateScore = (state.currentPlayerSymbol === this.humanPlayerSymbol) ? -1000 : 1000;
	let availablePositions = Board.emptyCells(state.board);
	let availableNextStates = availablePositions.map(pos => (new AIAction(pos)).applyTo(state, switchSymbol(this.humanPlayerSymbol)));

	availableNextStates.forEach(nextState => {
		let nextScore = this.minimaxValue(nextState);
		if (state.currentPlayerSymbol === this.humanPlayerSymbol) {
			if (nextScore > stateScore)
				stateScore = nextScore;
		} else {
			if (nextScore < stateScore)
				stateScore = nextScore;
		}
	});

	return stateScore;
};

TicTacToeGame.prototype.aiMove = function () {
	if (this.status !== 'running') return;
	const available = Board.emptyCells(this.currentState.board);
	let action;
	const turn = this.currentState.currentPlayerSymbol === 'X';

	if (this.difficulty === 1) {
		let randomCell = available[Math.floor(Math.random() * available.length)];
		action = new AIAction(randomCell);
	} else {
		let availableActions = available.map(pos => {
			let availableAction = new AIAction(pos);
			let nextState = availableAction.applyTo(this.currentState, switchSymbol(this.humanPlayerSymbol));
			availableAction.minimaxVal = this.minimaxValue(nextState);
			return availableAction;
		});

		availableActions.sort((turn === this.humanPlayerSymbol) ? AIAction.DESCENDING : AIAction.ASCENDING);

		action = (this.difficulty === 2 ?
			((Math.random() * 100 <= 40) ?
				availableActions[0] :
				((availableActions.length >= 2) ? availableActions[1] : availableActions[0])) :
			availableActions[0]);
	}

	let next = action.applyTo(this.currentState, switchSymbol(this.humanPlayerSymbol));
	this.advanceTo(next);
};

TicTacToeGame.prototype.score = function (state) {
	if (state.result === `${this.humanPlayerSymbol}-won`)
		return 10 - state.aiMovesCount;
	if (state.result === `${switchSymbol(this.humanPlayerSymbol)}-won`)
		return -10 + state.aiMovesCount;
	return 0;
};

function switchSymbol(sym) {
	return (sym === 'X') ? 'O' : 'X';
}