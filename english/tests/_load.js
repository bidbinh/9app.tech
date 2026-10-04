const path = require('path');
const root = path.join(__dirname, '..');
const names = ['email', 'meeting', 'report', 'travel', 'interview', 'finance', 'tech'];
const topics = names.map((n) => require(path.join(root, 'data', 'vocab-' + n + '.js')));
const vocabLib = require(path.join(root, 'js', 'vocab.js'));
module.exports = { root, topics, vocabLib, vocab: vocabLib.parse(topics) };
