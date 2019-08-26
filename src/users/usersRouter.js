const express = require('express');
const UsersServices = require('./UsersServices');
const AuthServices = require('../services/AuthServices');
const path = require('path');
const requireAuth = require('../middleware/requireAuth');
const SaveQuoteServices = require('../save/saveQuoteServices');
const userRouter = express.Router();
const jsonParser = express.json();

//Public Routes
userRouter.route('/')
  .all((req, res, next) => {
    this.db = req.app.get('db');
    next();
  })
  .post(jsonParser, (req, res, next) => {
    //Create User
    const { username, password } = req.body;

    UsersServices.checkIfUserExists(this.db, username)
      .then(userExists => {
        if(userExists) {
          return res.status(400).json({error: 'Username already taken'});
        }

        return UsersServices.hashPassword(password)
          .then(hashedPassword => {
            const validNewUser = {
              username,
              password : hashedPassword
            }
            
            UsersServices.insertUser(this.db, validNewUser)
              .then(insertedItemsArray => {
                [ newUser ] = insertedItemsArray;
                res.status(201)
                  .location(path.posix.join(req.originalUrl, `/${newUser.id}`))
                  .json(UsersServices.serializeUser(newUser));
              })
          })
      })
  })

userRouter.route('/login')
  .post(jsonParser, (req, res, next) => {
    const { username, password } = req.body;
    const userCredentials = { username, password };
    for (const [key, value] of Object.entries(userCredentials)) {
      if(!value) {
        return res.status(400).json({
          error: `missing ${key} in request body`
        });
      }
    }
    //grab user obj from db
    UsersServices.getUserByUsername(req.app.get('db'), username)
      .then(dbUser => {
        if(!dbUser.hasOwnProperty('id')) return res.status(400).json({error: 'Incorrect username'});
        //verify req password matches password stored in db.
        return AuthServices.comparePasswords(userCredentials.password, dbUser.password)
                .then(isMatch => {
                  if(!isMatch) return res.status(400).json({error: 'Incorrect password'});
                  //get saved quotes for user
                  SaveQuoteServices.getSavedQuotesByUserId(req.app.get('db'), dbUser.id)
                  .then(savedQuotes => {
                    //create jwt
                    const subject = dbUser.username;
                    const payload = { userId: dbUser.id };
                    res.status(200).send({
                      authToken: AuthServices.createJwt(subject, payload),
                      savedQuotes: savedQuotes
                    });
                  });
                });
      });
    //send jwt back to client
  });

//Protected Routes
userRouter.route('/:username')
  .all((req, res, next) => {
    this.db = req.app.get('db');
    next();
  })
  .all(requireAuth)
  .get((req, res, next) => {
    UsersServices.getUserByUsername(req.app.get('db'), req.user.username)
      .then(foundUser => {
        if(!foundUser.hasOwnProperty('id')) return res.status(404).send();
        const {id, username} = foundUser;
        res.status(200).json({id, username});
      });
  })
  .patch(jsonParser, (req, res, next) => {
    UsersServices.updateUserByUsername(this.db, req.user.username, req.body)
      .then(updatedUser => {
        if(!updatedUser.hasOwnProperty('id')) return res.status(404).send();
        const { id, username } = updatedUser;
        res.status(200).json({ id, username });
      });
  })
  .delete((req, res, next) => {
    UsersServices.deleteUser(this.db, req.user.username)
      .then(numberOfDeletedUsers => {
        if(numberOfDeletedUsers != 1)  return res.status(404).send();
        res.status(204).send();
      });
  });

module.exports = userRouter;