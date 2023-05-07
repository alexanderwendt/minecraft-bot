/*
 * This simple bot will help you find any block
 */
const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const { GoalBlock } = require('mineflayer-pathfinder').goals
const { GoalNear } = require('mineflayer-pathfinder').goals
const { performance } = require('perf_hooks')
const {GoalLookAtBlock, GoalGetToBlock} = require("mineflayer-pathfinder");
const collectBlock = require('mineflayer-collectblock').plugin

/**
 * global variables
 */
var oldBotPosition
var callerPlayerPosition
var callerPlayerUserName

var currentStep=0


/**
 * Setup bot
 *
 */
if (process.argv.length < 4 || process.argv.length > 6) {
  console.log('Usage : node blockfinder.js <host> <port> [<name>] [<password>]')
  process.exit(1)
}

const bot = mineflayer.createBot({
  host: process.argv[2],
  port: parseInt(process.argv[3]),
  username: process.argv[4] ? process.argv[4] : 'finder',
  password: process.argv[5]
})
let mcData

bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)
bot.loadPlugin(require('mineflayer-collectblock').plugin)

/**
 * Functions that the bot can use
 */

// go to a specific block
function goToBlock(p) {
  const defaultMove = new Movements(bot)
  bot.pathfinder.setMovements(defaultMove)
  bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
}

function sayItems (items = null) {
  if (!items) {
    items = bot.inventory.items()
    if (bot.registry.isNewerOrEqualTo('1.9') && bot.inventory.slots[45]) items.push(bot.inventory.slots[45])
  }
  const output = items.map(itemToString).join(', ')
  if (output) {
    bot.chat(output)
  } else {
    bot.chat('empty')
  }
}

function itemToString (item) {
  if (item) {
    return `${item.name} x ${item.count}`
  } else {
    return '(nothing)'
  }
}

function itemByName (name) {
  const items = bot.inventory.items()
  if (bot.registry.isNewerOrEqualTo('1.9') && bot.inventory.slots[45]) items.push(bot.inventory.slots[45])
  return items.filter(item => item.name === name)[0]
}

async function tossItem (name, amount) {
  amount = parseInt(amount, 10)
  const item = itemByName(name)
  if (!item) {
    bot.chat(`I have no ${name}`)
  } else {
    try {
      if (amount) {
        await bot.toss(item.type, null, amount)
        bot.chat(`tossed ${amount} x ${name}`)
      } else {
        await bot.tossStack(item)
        bot.chat(`tossed ${name}`)
      }
    } catch (err) {
      bot.chat(`unable to toss: ${err.message}`)
    }
  }
}

function getChest() {
  // On spawn, try to find any nearby chests and save those as storage locations.
// When the bot's inventory becomes too full, it will empty it's inventory into
// these chests before collecting more resources. If a chest gets full, it moves
// to the next one in order until it's inventory is empty or it runs out of chests.
  bot.collectBlock.chestLocations = bot.findBlocks({
    matching: mcData.blocksByName.chest.id,
    maxDistance: 16,
    count: 1 // Get as many chests as we can
  })

  if (bot.collectBlock.chestLocations.length === 0) {
    bot.chat("I don't see any chests nearby.")
  } else {
    for (const chestPos of bot.collectBlock.chestLocations) {
      bot.chat(`I found a chest at ${chestPos}`)
    }
  }
}

function depositToChest() {
  let chestToOpen = bot.collectBlock.chestLocations[0]
  if (chestToOpen) {
    goToBlock(chestToOpen)
    console.log("Got to chest")
    const chestBlock = bot.blockAt(chestToOpen)
    //const chest = await bot.openChest(chestBlock)
    try {
      depositItem(chestBlock, null, null)
    } catch (err) {
      console.log("Error %s", err)
    }

  } else {
    bot.chat(`Bot doesn't know any chests. Execute "get chest"`)
  }
}

async function depositItem (chestBlockToOpen, name, definedAmount) {
  console.log("Open chest")
  const chest = await bot.openChest(chestBlockToOpen)
  console.log("Chest opened")
  sayItems(chest.containerItems())
  let items

  if (!name) {
    items = bot.inventory.items()
  } else {
    items = itemByName(bot.inventory.items(), name)
  }

  if (items) {
    try {
      items.forEach(function(item) {
        console.log("Item: %s", item.name)
        let amount
        if (!definedAmount) {
          amount = item.count
        } else {
          amount = definedAmount
        }

        if (item) {
          try {
            chest.deposit(item.type, null, amount)
            bot.chat(`deposited item ${item.name}`)
          } catch (err) {
            bot.chat(`unable to deposit ${item}`)
            console.log("Error %s", err)
          }
        } else {
          bot.chat(`unknown item ${item}`)
        }
      });
    } catch (err) {
      bot.chat(`unable to deposit ${items}`)
      console.log("Error %s", err)
    }
  } else {
    bot.chat(`unknown item ${name}`)
  }

  console.log('Closing chest');
  setTimeout(chest.close, 500);
}

/**
 * Events
 */

// On spawn, start collecting all nearby grass
bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)
  //Get the closest chest location
  getChest()
})


bot.on("move", function() {
  currentStep++
  const botPosition = bot.entity.position;
  if (oldBotPosition != null && botPosition.distanceSquared(oldBotPosition) != 0 && currentStep%50==0) {
    callerPlayerPosition = bot.players[callerPlayerUserName].entity.position
    console.log("Player %s pos %s, bot pos %s", callerPlayerUserName, callerPlayerPosition, botPosition)
    bot.chat(`Distance to ${callerPlayerUserName}: ${Math.trunc(botPosition.distanceSquared(callerPlayerPosition))}`)
    oldBotPosition = botPosition
  }
})

bot.on('chat', async (username, message) => {
  let chestLocations;

  console.log("Caller name and message: %s:%s", callerPlayerUserName, message)
  if (username === bot.username) return

  //Come to calling user
  if(message.startsWith('come')) {
    callerPlayerUserName = username
    const target = bot.players[username].entity
    oldBotPosition = bot.entity.position;

    bot.chat(`Go to ${target.position}`)
    goToBlock(target.position)
  }

  //Waiting for chunks to load?
  if (message === 'loaded') {
    console.log(bot.entity.position)
    await bot.waitForChunksToLoad()
    bot.chat('Ready to do something!')
  }

  //Find and collect a block with name
  if (message.startsWith('collect') || message.startsWith('find')) {
    const name = message.split(' ')[1]
    let amount = message.split(' ')[2]

    if (bot.registry.blocksByName[name] === undefined) {
      bot.chat(`${name} is not a block name`)
      return
    }
    const id = [bot.registry.blocksByName[name].id]

    if (!amount) {
      amount = 1
    }

    const startTime = performance.now()
    for (let i=0;i<amount;i++) {
      const block = bot.findBlock({
        matching: id,
        maxDistance: 300,
        count: 10
      })
      console.log("Block {}", block)
      bot.chat(`Block position ${block.position}`)
      //Go to block
      goToBlock(block.position)

      const targets = []
      targets.push(bot.blockAt(block.position))

      if (message.startsWith('collect')) {
        try {
          await bot.collectBlock.collect(block)
          bot.chat(`Picked up ${block.name}`)
        } catch (err) {
          console.log(err);
        }
      }

      console.log("Inventory: {}", bot.inventory)
      sayItems()
    }

    const time = (performance.now() - startTime).toFixed(2)

    bot.chat(`I found ${amount} ${name} blocks in ${time} ms`)
  }

  //Return all items of the inventory
  if (message=='say inventory') {
    sayItems()
  }

  //Return bot position
  if (message=='bot position') {
    const botPosition = bot.entity.position;
    bot.chat(`My position: ${Math.trunc(botPosition.x)} ${Math.trunc(botPosition.y)} ${Math.trunc(botPosition.z)}`)
  }

  //Specify chest location to put found stuff into
  if (message=='get chest') {
    getChest()
  }

  //Deposit all content to chest
  if (message=='put chest') {
    depositToChest()
  }
}

)