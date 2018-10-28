var WavesAPI = require('./waves-api');
const Waves = WavesAPI.create(WavesAPI.MAINNET_CONFIG);

const Telegraf = require('telegraf');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Markup = require('telegraf/markup');
const Scene = require('telegraf/scenes/base');
const { enter, leave } = Stage;

const CONFIG = {
	bot_token: '',
	database_url: '',
	admin_id: ''
};

function parseBotDataText (data) {
	if (data.message !== undefined) {
		return data.message.text;
    } else if (data.update.callback_query !== undefined) {
    	return data.update.callback_query.message.text;
    } else if (data.update.message !== undefined) {
    	return data.update.message.text;
    }	
}

function parseBotDataFrom (data) {
	if (data.message !== undefined) {
		return data.message.from;
    } else if (data.update.callback_query !== undefined) {
    	return data.update.callback_query.from;
    } else if (data.update.message !== undefined) {
    	return data.update.message.from;
    }
}

function default_response (ctx, text, isMarkdown) {
	if (isMarkdown) {
		return ctx.replyWithMarkdown(text, Markup.keyboard([
			['Send', 'Receive'],
			['Wallet', 'Settings']
			]).oneTime().resize().extra());
	} else {
		return ctx.reply(text, Markup.keyboard([
			['Send', 'Receive'],
			['Wallet', 'Settings']
			]).oneTime().resize().extra());
	}
}

const sendMoneyAmountScene = new Scene('send_money_amount');
sendMoneyAmountScene.enter((ctx, next) => {
	new Promise (function(resolve, reject) {
		return ctx.reply('Enter amount');
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

sendMoneyAmountScene.on('message', (ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataText = parseBotDataText(ctx);
		let botDataFrom = parseBotDataFrom(ctx);

		if (botDataText === 'Cancel') {
			ctx.scene.leave();
			return default_response(ctx, `Cancel`, false);
		}

		let amount = botDataText;
		let address = ctx.session.recipients_address;

		if (isNaN(amount)) {
			return ctx.reply('Enter number amount');
		}

		Waves.API.Node.addresses.balance(address).then((balance) => {
			Users.find({telegram_id: botDataFrom.id})
			.exec()
			.then(mongo_result => {
				Waves.API.Node.addresses.balance(mongo_result[0].waves_address).then((waves_result) => {
					amount = Number(amount*100000000);
					let waves_balance = waves_result.balance;
					waves_balance = Number(waves_balance)+Number(0.001);

					if (amount>waves_balance) {
						return ctx.reply('Insufficient funds');
					} 

					const seed = Waves.Seed.fromExistingPhrase(mongo_result[0].waves_phrase);

					const transferData = {
						recipient: address,
						assetId: 'WAVES',
						amount: amount,
						feeAssetId: 'WAVES',
						fee: 100000,
						attachment: 'Waves bot - https://t.me/waves_wallet_bot',
						timestamp: Date.now()
					};

					Waves.API.Node.transactions.broadcast('transfer', transferData, seed.keyPair).then((responseData) => {
						ctx.scene.leave();
						ctx.session.recipients_address = null;
						return default_response(ctx, `Successfully sent!`, false);
					});
				});
			})
			.catch(mongo_error => {
				bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
				return default_response(ctx, `Bot error`, false);
			});	  
		}).catch(error => {
			return ctx.reply('Invalid address');
		})
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

const sendMoneyScene = new Scene('send_money');
sendMoneyScene.enter((ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataFrom = parseBotDataFrom(ctx);
		Users.find({telegram_id: botDataFrom.id})
		.exec()
		.then(mongo_result => {
			Waves.API.Node.addresses.balance(mongo_result[0].waves_address).then((waves_result) => {
				if (waves_result.balance === 0) {
					ctx.scene.leave();
					return default_response(ctx, `You have no money on your wallet`, false);
				} else {
					return ctx.replyWithMarkdown('Enter the recipients address', Markup.keyboard([
						['Cancel']
						]).oneTime().resize().extra());
				}
			});
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
			return default_response(ctx, `Bot error`, false);
		});	
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

sendMoneyScene.hears('Cancel', (ctx, next) => {
	ctx.scene.leave();
	return default_response(ctx, `Cancel`, false);
});

sendMoneyScene.on('message', (ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataText = parseBotDataText(ctx);
		let botDataFrom = parseBotDataFrom(ctx);

		let address = botDataText;

		Waves.API.Node.addresses.balance(address).then((balance) => {
			Users.find({telegram_id: botDataFrom.id})
			.exec()
			.then(mongo_result => {
				Waves.API.Node.addresses.balance(mongo_result[0].waves_address).then((waves_result) => {
					if (address === mongo_result[0].waves_address) {
						return ctx.reply('You can not send money to yourself');
					}
					ctx.scene.leave();
					ctx.session.recipients_address = address;
					return ctx.scene.enter('send_money_amount');
				});
			})
			.catch(mongo_error => {
				bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
				return default_response(ctx, `Bot error`, false);
			});	  
		}).catch(error => {
			return ctx.reply('Invalid address');
		})
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

const bot = new Telegraf(CONFIG.bot_token);
const stage = new Stage([sendMoneyScene, sendMoneyAmountScene])
bot.use(session())
bot.use(stage.middleware())

const mongoose = require('mongoose');
mongoose.connect(CONFIG.database_url, {
	useNewUrlParser: true
});
let db = mongoose.connection;
db.on('error', function() {
    console.log('Error connection to MongoDB');
});
db.once('open', function() {
    console.log('Successfuly connection to MongoDB');
});

let users_schema = mongoose.Schema({
    telegram_id: { type: Number, required: true },
    waves_address: { type: String, required: true },
    waves_phrase: { type: String, required: true },
    bot_lang: { type: String, required: true },
});

let Users = mongoose.model('Users', users_schema);

bot.start((ctx) => {
	new Promise (function(resolve, reject) {
		let botDataFrom = parseBotDataFrom(ctx);
		Users.find({telegram_id: botDataFrom.id})
		.exec()
		.then(mongo_result => {
			if (mongo_result.length === 0) {
				return ctx.reply('Welcome! Please shoose language', Markup.inlineKeyboard([
					Markup.callbackButton('🇺🇸 English', 'select_eng_lang'),
					]).extra());
			} else {
				return default_response(ctx, `Bot did not understand you`, false);
			}
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
			return default_response(ctx, `Bot error`, false);
		});
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.action('select_eng_lang', (ctx, next) => {
	new Promise (function(resolve, reject) {
		ctx.reply('English is selected');

		let botDataFrom = parseBotDataFrom(ctx);
		const seed = Waves.Seed.create();

		const newUser = new Users({
			_id: new mongoose.Types.ObjectId(),
			telegram_id: Number(botDataFrom.id),
			waves_address: seed.address,
		    waves_phrase: seed.phrase,
		    bot_lang: 'en'
		});
		newUser
		.save()
		.then(mongo_create_new_user => {
			return default_response(ctx, `Bot has generated your wallet`, false);
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR WHEN CREATED NEW USER!');
			return default_response(ctx, `Bot error`, false);
		});
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.hears('Send', (ctx, next) => {
	new Promise (function(resolve, reject) {
		return ctx.scene.enter('send_money');
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.hears('Receive', (ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataFrom = parseBotDataFrom(ctx);
		Users.find({telegram_id: botDataFrom.id})
		.exec()
		.then(mongo_result => {
			return default_response(ctx, `*${mongo_result[0].waves_address}*`, true);
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
			return default_response(ctx, `Bot error`, false);
		});	
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.hears('Wallet', (ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataFrom = parseBotDataFrom(ctx);
		Users.find({telegram_id: botDataFrom.id})
		.exec()
		.then(mongo_result => {
			Waves.API.Node.addresses.balance(mongo_result[0].waves_address).then((waves_result) => {
				let waves_balance = Number(waves_result.balance/100000000);
				return ctx.replyWithMarkdown(`*${waves_balance} WAVES*`, Markup.inlineKeyboard([
					Markup.callbackButton('Transactions history', 'transactions_history'),
					]).extra())
			});
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
			return default_response(ctx, `Bot error`, false);
		});	
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.hears('Settings', (ctx, next) => {
	new Promise (function(resolve, reject) {
		return ctx.reply('Settings', Markup.keyboard([
			['Export seed phrase', 'Cancel'],
			]).oneTime().resize().extra());
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.hears('Export seed phrase', (ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataFrom = parseBotDataFrom(ctx);
		Users.find({telegram_id: botDataFrom.id})
		.exec()
		.then(mongo_result => {
			return default_response(ctx, `Mnemonic phrase - *${mongo_result[0].waves_phrase}*\n\n*Save and delete this message*`, true);
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
			return default_response(ctx, `Bot error`, false);
		});	
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.command('users_amount', (ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataFrom = parseBotDataFrom(ctx);
		if (botDataFrom.id !== CONFIG.admin_id) {
			return false;
		}

		Users.find()
		.exec()
		.then(mongo_result => {
			return default_response(ctx, `Users amount - *${mongo_result.length}*`, true);
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
			return default_response(ctx, `Bot error`, false);
		});	
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.hears('Cancel', (ctx, next) => {
	new Promise (function(resolve, reject) {
		return default_response(ctx, `Cancel`, false);
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.action('transactions_history', (ctx, next) => {
	new Promise (function(resolve, reject) {
		return default_response(ctx, `Coming soon...`, false);
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.on('text', (ctx, next) => {
	new Promise (function(resolve, reject) {
		let botDataFrom = parseBotDataFrom(ctx);
		Users.find({telegram_id: botDataFrom.id})
		.exec()
		.then(mongo_result => {
			if (mongo_result.length === 0) {
				return ctx.reply('Welcome! Please shoose language', Markup.inlineKeyboard([
					Markup.callbackButton('🇺🇸 English', 'select_eng_lang'),
					]).extra());
			} else {
				return default_response(ctx, `Bot did not understand you`, false);
			}
		})
		.catch(mongo_error => {
			bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
			return default_response(ctx, `Bot error`, false);
		});
	})
	.catch ((error) => {
        bot.telegram.sendMessage(CONFIG.admin_id, 'BOT ERROR!');
		return default_response(ctx, `Bot error`, false);
    });
});

bot.startPolling();