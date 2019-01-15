const express = require('express');
const uuid = require('uuid/v4');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const body_parser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const axios = require('axios');
const bcrypt = require('bcrypt-nodejs');

/*
  Configurations
 */
// User lookup from mock db API
passport.use(new LocalStrategy(
  {usernameField: 'email'},
  (username, password, done) => {
    axios.get(`http://localhost:5050/users?email=${username}`)
      .then((res) => {
        const user = res.data[0];
        if (!user) {
          return done(null, false, {message: 'Wrong username (email) or password.\n'});
        }
        if (!bcrypt.compareSync(password, user.password)) {
          return done(null, false, {message: 'Wrong username (email) or password.\n'});
        }
        return done(null, user);
      })
      .catch((error) => done(error));
  }
));
// User persistence (using user.id as identifier, which is saved to session storage)
passport.serializeUser((user, done) => {
  done(null, user.id);
});
// Reverse, get user data from persistence (by identifier)
passport.deserializeUser((identifier, done) => {
  axios.get(`http://localhost:5050/users/${identifier}`)
    .then((res) => done(null, res.data))
    .catch((error) => done(error, false));
});

const app = express();

/*
  Middleware
 */
// Enable CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
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

/*
  Routes
 */
app.get('/auth', (req, res) => {
  if (req.isAuthenticated()) {
    res.send(req.user.id);
  } else {
    res.status(401).send('You must log-in first.');
  }
});
app.post('/auth', (req, res, next) => {
  // Execute user lookup (compared to req.body)
  passport.authenticate('local', (err, user, info) => {
    if (info) {
      return res.status(401).send(info.message);
    }
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).send('Bad request.\n');
    }
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      return res.send(`Welcome ${user.id}`);
    });
  })(req, res, next);
});

app.listen(3030, () => {
  console.log('Running in port 3030');
});