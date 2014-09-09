var daggy   = require('daggy'),
    R       = require('ramda'),
    bacon   = require('baconjs'),
    crel    = require('crel'),
    rebound = require('./rebound'),
    jQ      = require('jquery');


// Data Types
var CardType = daggy.taggedSum({ Red: [], Green: [], Blue: [] });
var Card     = daggy.tagged('cardType');
var Action   = daggy.taggedSum({
  PickupCard : ['card'],
  LoseCard   : ['card']
});

var translate = function(el, x, y) {
  el.style.mozTransform =
  el.style.msTransform =
  el.style.webkitTransform =
  el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
};

// :: Action
var pickupRandomCard = function() {
  var color;

  color = R.head(
    ['Red','Green','Blue'].sort(function() { return Math.random() - 0.5; })
  );

  return Action.PickupCard(Card(CardType[color]));
};

// :: Card -> Action
var discardCard = function(card) {
  return Action.LoseCard(card);
};

// :: Element -> [Element] -> Element
var replaceChildren = function(el, xs) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }

  R.forEach(function(x) {
    el.appendChild(x);
  }, xs);

  return el;
};


// :: Stream Action -> Stream [CardUi]
var foldCards = function(f) {
  return f.scan([], function(m, a) {
    if (a instanceof Action.PickupCard) {
      return R.append(createCardUi(a.card), m);
    }
    else if (a instanceof Action.LoseCard) {
      return R.reject(function(x) {
        return x.card === a.card;
      }, m);
    }
    else {
      return m;
    }
  });
};


// { el :: Element, clicks :: Stream }
var createCardDeck = function() {
  var deck, clicks;

  deck = crel('div', { 'class': 'CardDeck' },
    crel('span', 'Card Deck')
  );

  clicks = bacon.fromEventTarget(deck, 'click');

  return {
    el: deck,
    clicks: clicks
  };
};

// Terrible terrible global
var springSystem = new rebound.SpringSystem();

// Fills out the UI data for a card
var createCardUi = function(card) {
  var springX, springY, posUpdates, posProp;

  springY = springSystem.createSpring(30, 10);
  springX = springSystem.createSpring(30, 10);

  // Turn the springs into streams of positions
  posUpdates = bacon.fromBinder(function(sink) {
    springY.addListener({
      onSpringUpdate: function(spring) {
        sink({ y: spring.getCurrentValue() });
      }
    });

    springX.addListener({
      onSpringUpdate: function(spring) {
        sink({ x: spring.getCurrentValue() });
      }
    });

    return function unsub() {

    };
  });

  // collate them
  posProps = posUpdates.scan({ x: 0, y: 0 }, function(m, a) {
    if (typeof a.x !== 'undefined') {
      m.x = a.x;
    }

    if (typeof a.y !== 'undefined') {
      m.y = a.y;
    }

    return m;
  });

  return {
    card: card,
    springY: springY,
    springX: springX,
    position: posProps
  };
};

// Fills out the dom element of a card
var createCardEl = function(cardUi) {
  var el, colorClass;

  el = crel('div', { 'class': 'PlayingCard' }, 'Card!');

  colorClass = cardUi.card.cardType.cata({
    Red: R.always('PlayingCard--red'),
    Green: R.always('PlayingCard--green'),
    Blue: R.always('PlayingCard--blue'),
  });

  el.classList.add(colorClass);

  cardUi.position.onValue(function(pos) {
    translate(el, pos.x, pos.y);
  });

  return {
    el: el,
    card: cardUi.card,
    springY: cardUi.springY,
    springX: cardUi.springX,
    position: cardUi.position
  };
};

var moveCardTo = function(cardEl, x, y) {
  cardEl.springX.setEndValue(x);
  cardEl.springY.setEndValue(y);
};

// :: Property -> { el :: Element, plays :: Stream }
var createPlayingHand = function(cardProp) {
  var el, clicks, plays, cardEls;

  el = crel('div', { 'class': 'PlayerHand' });

  clicks = bacon.fromEventTarget(el, 'click');

  cardEls = cardProp.map(function(cards) {
    return R.map(createCardEl, cards);
  });

  // Side Effects - wipe the inner el every time the cards change
  cardEls.onValue(function(cardEls) {
    replaceChildren(el, R.pluck('el', cardEls));

    R.forEach.idx(function(cardEl, i) {
      // Quick and dirty distribution
      var xPos = (Math.min((500 / cardEls.length), 100) * i) + 50;

      moveCardTo(cardEl, xPos, 300);
    }, cardEls);
  });

  // Matching clicks to els
  plays = clicks.flatMap(function(ev) {
    return cardEls.flatMap(function(cardEls) {
      var card = R.find(function(cardEl) {
        return cardEl.el === ev.target;
      }, cardEls);

      if (card) {
        return bacon.once(card.card);
      }
      else {
        return bacon.never();
      }
    });
  });

  return {
    el: el,
    plays: plays
  };
};

// { el :: Element }
var createApp = function() {
  var deck, el, actions;

  actions = new bacon.Bus();

  // Setup card deck
  deck = createCardDeck();
  actions.plug(deck.clicks.map(pickupRandomCard));

  // Setup playing hand
  hand = createPlayingHand(foldCards(actions));
  actions.plug(hand.plays.map(discardCard));

  // Create the app element
  el = crel('div', { 'class': 'CardApp' },
    deck.el,
    hand.el
  );

  return {
    el: el,
    actions: actions
  };
};


// Main
window.onload = function main() {
  var app = createApp();

  app.actions.log('action:');

  document.body.appendChild(app.el);
};

