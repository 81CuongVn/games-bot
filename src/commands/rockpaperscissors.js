

const reactions = {
  '🇷': 0,
  '🇵': 1,
  '🇸': 2,
};

const words = ['Rock', 'Paper', 'Scissors'];

const results = [
  // Rock Paper Scissors
  [0, 1, -1], // Rock
  [-1, 0, 1], // Paper
  [1, -1, 0], // Scissors
];

module.exports = {
  aliases: ['rps'],
  desc: 'Plays rock paper scissors',
  run: rockPaperScissors,
};

async function rockPaperScissors(message) {
  if (message.mentions.members.size < 1) return message.channel.send('Please ping someone to challenge them to tic tac toe!');
  message.channel.send('Wait for a DM to tell me your choice').catch(logger.error);
  const players = [message.member, message.mentions.members.first()];
  const choices = [null, null];

  await players.forEach(async (player, ind) => {
    if (player.id === bot.id) {
      choices[ind] = Object.values(reactions)[Math.floor(Math.random() * 3)];
      return;
    }
    const msg = await player.user.send('Would you like to show 🇷ock, 🇵aper, or 🇸cissors?').catch(logger.error);
    for (let i = 0; i < 3; i++) await msg.react(Object.keys(reactions)[i]);
    const collected = await msg.awaitReactions((r, user) => ['🇷', '🇵', '🇸'].includes(r.emoji.name) && user.id === player.id, { maxUsers: 1, time: 60 * 1000 });
    if (collected.size < 1) return this.sendCollectorEndedMessage().catch(logger.error);
    player.user.send(`You chose ${reactions[collected.first().emoji.name]}.`);
    choices[ind] = reactions[collected.first().emoji.name];
  });

  logger.info(choices);
  let result = '';
  [0, 1].forEach(ind => result += `${players[ind]} chose ${words[choices[ind]]}\n`);
  const p1won = results[choices[0]][choices[1]];
  result += p1won ? `${(p1won === 1 ? players[0] : players[1])} won. GG!` : 'It was a draw. GG!';
}
