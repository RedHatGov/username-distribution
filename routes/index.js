var express = require('express');
var router = express.Router();
var config = require('../config');
const log = require('barelog')
const { urlencoded, json } = require('body-parser')
const users = require('../lib/users')
const { default: PQueue } = require('p-queue')

const assigmentQ = new PQueue({
  concurrency: 1
})

var title = config.eventTitle;
var password = config.accounts.password;

router.get('/request-account', urlencoded(), (req, res) => {
  if (req.session.email) {
    // User has already requested an account, redirect them
    res.redirect('/')
  } else {
    res.render('request-account', {title: title})
  }
})

router.post('/request-account', urlencoded(), (req, res) => {
  if (!req.body.email) {
    res.render('sorry', {
      message: 'Please enter a valid proper email address to request an account.'
    })
  } else if (req.body.accessToken !== config.accounts.accessToken) {
    res.render('sorry', {
      message: 'Please enter a valid password to access an account.'
    })
  } else {
    log('user requested account with email:', req.body.email)
    req.session.email = req.body.email.trim()
    res.redirect('/')
  }
})


// Support requesting a user account via JSON API
router.post('/', json(), async (req, res) => {
  const email = req.body.email

  if (req.body.accessToken !== config.accounts.accessToken) {
    res.status(401).json({
      message: 'Invalid access token provided.'
    })
  } else if (!email) {
    res.status(400).json({
      message: 'Please include an "email" field in the request body.'
    })
  } else {
    assigmentQ.add(async () => {
      const user = await users.getAndAssignUser(req.headers['x-forwarded-for'] || req.connection.remoteAddress, email)

      if (user) {
        res.json({
          username: user.username
        })
      } else {
        res.status(429).json({
          message: 'All available accounts are currently in use. Please try again later.'
        })
      }
    })
  }
})

/* GET home page. */
router.get('/', async (req, res) => {
  var email = req.session.email

  if (!email) {
    res.redirect('/request-account')
  } else {
    // Users are a resource that are locked/unlocked asynchronously in the cache
    // We need to queue user account assignments to avoid assigning an account
    // to multiple users
    assigmentQ.add(async () => {
      var username = req.session.username

      if (username) {
        const valid = await users.isUserAssignmentValid(username)

        if (!valid) {
          // perform unassignment on the session
          log(`no longer valid. unassigning the existing user ${username}`)
          username = req.session.username = undefined
        }
      }

      if (!username) {
        log('the incoming connection has no user in the session, requesting new user assignment')
        let user = await users.getAndAssignUser(req.headers['x-forwarded-for'] || req.connection.remoteAddress, email)

        if (user) {
          log('found free user is', user)
          username = user.username
        }
      }

      if (!username) {
        res.render('sorry', {
          message: 'All available accounts have been assigned to participants. Please contact the lab administrator if you believe this is an error.'
        })
      } else {
        req.session.username = username

        var subs = [
          ['USERNAME', username],
          ['EMAIL', email],
          ['LAB_TITLE', title],
          ['LAB_DURATION_HOURS', config.eventHours],
          ['LAB_USER_COUNT', config.accounts.number],
          ['LAB_USER_PASS', config.accounts.password],
          ['LAB_USER_ACCESS_TOKEN', config.accounts.accessToken],
          ['LAB_USER_PREFIX', config.accounts.prefix]
        ];

        res.render('index', {
          username,
          email,
          password: password,
          title: title,
          modules: config.modules.map(function(val){
              val = val.split(';');
              return {url:val[0], prettyName:val[1]}
          }).map(function(val) {
            var url = val.url
            var prettyName = val.prettyName
            subs.forEach(function(sub) {
              url = url.replace(new RegExp('%' + sub[0] + '%', 'g'), sub[1])
              prettyName = prettyName.replace(new RegExp('%' + sub[0] + '%', 'g'), sub[1])
            })
            return {url: url, prettyName: prettyName}
          }),
          extraUrls: config.extraUrls.map(function(val){
            val = val.split(';');
            return {url:val[0], prettyName:val[1]}
          }).map(function(val) {
            var url = val.url
            var prettyName = val.prettyName
            subs.forEach(function(sub) {
              url = url.replace(new RegExp('%' + sub[0] + '%', 'g'), sub[1])
              prettyName = prettyName.replace(new RegExp('%' + sub[0] + '%', 'g'), sub[1])
            })
            return {url: url, prettyName: prettyName}
          })
        });
      }
    })
  }

});

module.exports = router;
