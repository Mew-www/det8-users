const express = require('express');
const uuid = require('uuid/v4');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const body_parser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const axios = require('axios');
const bcrypt = require('bcrypt-nodejs');
const cors = require('cors');

const HSL_API_KEY = process.env.HSL_API_KEY;

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
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.options('*', cors());
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
    res.send(JSON.stringify({name: req.user.id, phone: req.user.phone}));
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
      return res.send(JSON.stringify({name: user.id, phone: user.phone}));
    });
  })(req, res, next);
});

app.get('/history', (req, res) => {
  if (req.isAuthenticated()) {
    axios.get(`http://localhost:5050/histories/${req.user.id}`, {headers: {'Content-Type': 'application/json'}})
      .then((response) => {
        let all_queries = response.data.queries;
        let unique_queries = [];
        for (let query of all_queries) {
          let is_unique = true;
          for (let known_query of unique_queries) {
            if (JSON.stringify(query) === JSON.stringify(known_query)) {
              is_unique = false;
            }
          }
          if (is_unique) {
            unique_queries.push(query);
          }
        }
        res.send(unique_queries);
      })
      .catch((error) => res.send(error.response.data));
  } else {
    res.status(401).send('You must log-in first.');
  }
});

app.post('/history', (req, res) => {
  if (req.isAuthenticated()) {
    axios.get(`http://localhost:5050/histories/${req.user.id}`)
      .then((response1) => {
        let existing_queries = response1.data.queries;
        axios.put(
          `http://localhost:5050/histories/${req.user.id}`,
          {'queries': existing_queries.concat(req.body.queries).filter(query => query)},
          {headers: {'Content-Type': 'application/json'}}
        )
          .then((response2) => res.send('OK'))
          .catch((error) => res.send(error.response.data));
      })
      .catch((error) => res.send(error.response.data));
  } else {
    res.status(401).send('You must log-in first.');
  }
});

app.get('/tickets', (req, res) => {
  if (req.isAuthenticated()) {
    axios.get(`http://localhost:5050/tickets/${req.user.id}`, {headers: {'Content-Type': 'application/json'}})
      .then((response) => {
        let valid_until_timestamps = Object.keys(response.data)
          .filter(key => key !== "id")
          .filter(timestamp => parseInt(timestamp) > (new Date()).getTime()/1000);
        res.send(valid_until_timestamps.map(key => {return {...response.data[key], valid_until: key};}));
      })
      .catch((error) => res.send(error.response.data));
  } else {
    res.status(401).send('You must log-in first.');
  }
});

app.post('/tickets', (req, res) => {
  if (req.isAuthenticated()) {
    axios.get(`http://localhost:5050/tickets/${req.user.id}`)
      .then((response1) => {
        let data = response.data;
        data[req.body.valid_until] = req.body;
        axios.put(
          `http://localhost:5050/tickets/${req.user.id}`,
          data,
          {headers: {'Content-Type': 'application/json'}}
        )
          .then((response2) => res.send('OK'))
          .catch((error) => res.send(error.response.data));
      })
      .catch((error) => res.send(error.response.data));
  } else {
    res.status(401).send('You must log-in first.');
  }
});

app.post('/buyHSL', (req, res) => {
  if (req.isAuthenticated()) {
    axios.post('https://sales-api.hsl.fi/api/sandbox/ticket/v3/order', req.body, {headers: {"X-API-Key": HSL_API_KEY}})
      .then(response => {
        res.send(JSON.stringify((response.data)));
      })
      .catch(error => {
        res.send(error.response.data);
      })
  } else {
    res.status(401).send('You must log-in first');
  }
});

app.listen(3030, () => {
  console.log('Running in port 3030');
  console.log(HSL_API_KEY);
});