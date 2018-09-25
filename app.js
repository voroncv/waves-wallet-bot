const WavesAPI = require('@waves/waves-api');
const Waves = WavesAPI.create(WavesAPI.MAINNET_CONFIG);

const Telegraf = require('telegraf');
const Composer = require('telegraf/composer');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Markup = require('telegraf/markup');
const WizardScene = require('telegraf/scenes/wizard');
const Scene = require('telegraf/scenes/base');
const { enter, leave } = Stage;

const walletPanelScene = new Scene('wallet_panel');
walletPanelScene.enter((ctx) => {
	return ctx.reply('Wallet successfully added', Markup.keyboard([
		['Send', 'Receive'],
		['Wallet', 'Settings']
		]).oneTime().resize().extra());
});

const newWalletScene = new Scene('new_wallet')
newWalletScene.enter((ctx) => {
	const seed = Waves.Seed.create();
	ctx.replyWithMarkdown(`Address your wallet - *${seed.address}*`);
	ctx.replyWithMarkdown(`Seed phrase - *${seed.phrase}* SAVE THIS AND DELETE MESSAGE`);
	ctx.session.address = seed.address;
	ctx.session.phrase = seed.phrase;
	ctx.scene.leave();
	return ctx.scene.enter('wallet_panel');
});

const restoreWalletScene = new Scene('restore_wallet')
restoreWalletScene.enter((ctx) => {
	return ctx.reply('Enter seed phrase');
});

const greeterScene = new Scene('greeter')
greeterScene.enter((ctx) => {
	if (ctx.session.lang === 'en') {
		return ctx.reply('Choose option', Markup.inlineKeyboard([
			Markup.callbackButton('Create new wallet', 'new_wallet'),
			Markup.callbackButton('Restore wallet', 'restore_wallet')
			]).extra());
	} else if (ctx.session.lang === 'ru') {
		return ctx.reply('Выберите тип кошелька', Markup.inlineKeyboard([
			Markup.callbackButton('Создать кошелек', 'new_wallet'),
			Markup.callbackButton('Восстановить кошелек', 'restore_wallet')
			]).extra());
	}
});
greeterScene.action('new_wallet', (ctx) => {
	ctx.scene.leave();
	return ctx.scene.enter('new_wallet');
});

greeterScene.action('restore_wallet', (ctx) => {
	ctx.scene.leave();
	return ctx.scene.enter('restore_wallet');
});

greeterScene.on('message', (ctx) => {
	return ctx.reply('Use buttons')
});

const stepHandler = new Composer();

stepHandler.action('select_eng_lang', (ctx) => {
	ctx.session.lang = 'en';
	ctx.reply('English is selected');
	ctx.scene.leave();
	return ctx.scene.enter('greeter')
});

stepHandler.action('select_rus_lang', (ctx) => {
	ctx.session.lang = 'ru';
	ctx.reply('Выбран русский язык');
	ctx.scene.leave();
	return ctx.scene.enter('greeter')
});

stepHandler.use((ctx) => {
	ctx.replyWithMarkdown('Press `Next` button or type /next');
});

const superWizard = new WizardScene('super-wizard',
	(ctx) => {
		console.log(ctx.session)
		ctx.reply('Welcome! Please shoose language', Markup.inlineKeyboard([
			Markup.callbackButton('🇺🇸 English', 'select_eng_lang'),
			Markup.callbackButton('🇷🇺 Русский', 'select_rus_lang')
			]).extra())
		return ctx.wizard.next();
	},
	stepHandler
)

const bot_token = '';
const bot = new Telegraf(bot_token);
const stage = new Stage([superWizard, greeterScene, newWalletScene, restoreWalletScene, walletPanelScene], { default: 'super-wizard' });
bot.use(session());
bot.use(stage.middleware());
bot.startPolling();