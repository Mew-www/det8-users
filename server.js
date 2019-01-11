const express = require('express');
const uuid = require('uuid/v4');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const body_parser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local');

// Configure mock users (no hashing etc. implemented)
const users = [
  {id: 'asdfg1', email: 'user@example.com', password: 'password'}
];
// Configure user lookup
passport.use(new LocalStrategy(
  {usernameField: 'email'},
  (username, password, done) => {
    for (let user of users) {
      if (username === user.email && password === user.password) {
        console.log(`User ${user.email} logged in successfully`);
        return done(null, user);
      }
    }
  }
));
// Configure user persistence (using user.id as identifier, which is saved to session storage)
passport.serializeUser((user, done) => {
  done(null, user.id);
});
// Reverse, from persistence
passport.deserializeUser((identifier, done) => {
  let this_user = false;
  for (let user of users) {
    if (identifier === user.id) {
      this_user = user;
    }
  }
  done(null, this_user);
});

const app = express();

// Define content-type parser for both form-urlencoded and json
app.use(body_parser.urlencoded({extended: false}));
app.use(body_parser.json());
// Define session-storage
app.use(session({
  genid: (req) => uuid(),  // UUID provides new session ids
  store: new FileStore(),
  secret: 'changethis-and-fetch-it-from-envvar',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Specify routes
app.get('/', (req, res) => {
  console.log(`${req.sessionID} loaded homepage`);
  res.send(`homepage\n`);
});

app.get('/auth', (req, res) => {
  if (req.isAuthenticated()) {
    res.send(`Authenticated as ${req.user.id}`);
  } else {
    res.send('Use POST to log-in');
  }
});

app.post('/auth', (req, res, next) => {
  // Execute user lookup (compared to req.body)
  passport.authenticate('local', (err, user, info) => {
    // On successful login
    req.login(user, (err) => {
      console.log(`req.session.passport: ${JSON.stringify(req.session.passport)}`);
      console.log(`req.user: ${JSON.stringify((req.user))}`);
      res.send('Logged in\n');
    });
  })(req, res, next);
});

app.listen(3030, () => {
  console.log('Running in port 3030');
});