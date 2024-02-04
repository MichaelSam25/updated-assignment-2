const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const path = require('path')
const jwt = require('jsonwebtoken')

const databasePath = path.join(__dirname, 'twitterClone.db')

const app = express()

app.use(express.json())

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

const validatePassword = password => {
  return password.length > 5
}

function authenticationToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//API-1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    const createUserQuery = `
        INSERT INTO 
            user (username, password, name, gender) 
        VALUES 
            (
            '${username}', 
            '${hashedPassword}', 
            '${name}',
            '${gender}'
            )`
    if (validatePassword(password)) {
      await db.run(createUserQuery)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API-2
app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API-3
app.get(
  '/user/tweets/feed/',
  authenticationToken,
  async (request, response) => {
    const {username} = request
    const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const loggedinUserId = await db.get(loggedinUserIdQuery)
    console.log(loggedinUserId)
    const followingQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${loggedinUserId.user_id};`
    const followingUserIds = await db.all(followingQuery)
    console.log(followingUserIds)
    const tweetsQuery = `SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM follower 
    INNER JOIN tweet 
    ON follower.following_user_id = tweet.user_id 
    INNER JOIN user
    ON tweet.user_id = user.user_id
    WHERE 
    follower.follower_user_id = ${loggedinUserId.user_id}
    ORDER BY tweet.date_time DESC 
    LIMIT 4;`
    const tweets = await db.all(tweetsQuery)
    response.send(tweets)
  },
)
//API-4
app.get('/user/following/', authenticationToken, async (request, response) => {
  const {username} = request
  const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const loggedinUserId = await db.get(loggedinUserIdQuery)
  console.log(loggedinUserId)
  const followingQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${loggedinUserId.user_id};`
  const followingUserIds = await db.all(followingQuery)
  console.log(followingUserIds)
  const nameQuery = `SELECT 
  user.name 
  FROM
  follower
  INNER JOIN user
  ON follower.following_user_id = user.user_id
  WHERE
  follower.follower_user_id = ${loggedinUserId.user_id};`
  const following = await db.all(nameQuery)
  response.send(following)
})

//API-5
app.get('/user/followers/', authenticationToken, async (request, response) => {
  const {username} = request
  const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const loggedinUserId = await db.get(loggedinUserIdQuery)
  console.log(loggedinUserId)
  const followerQuery = `SELECT follower_user_id FROM follower WHERE following_user_id=${loggedinUserId.user_id};`
  const followerIds = await db.all(followerQuery)
  console.log(followerIds)
  const followerNameQuery = `SELECT user.name
  FROM
  follower 
  INNER JOIN user 
  ON follower.follower_user_id = user.user_id
  WHERE follower.following_user_id = ${loggedinUserId.user_id};`
  const followers = await db.all(followerNameQuery)
  response.send(followers)
})

//API-6
app.get('/tweets/:tweetId/', authenticationToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const loggedinUserId = await db.get(loggedinUserIdQuery)
  console.log(loggedinUserId)
  const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
  const tweetUserId = await db.get(tweetUserIdQuery)
  console.log(tweetUserId)
  const followingQuery = `
  SELECT following_user_id AS user_id FROM follower WHERE follower_user_id = ${loggedinUserId.user_id};`
  const followingUserIds = await db.all(followingQuery)
  console.log(followingUserIds)
  const checkFollowing = followingUserIds.find(
    obj => obj.user_id === tweetUserId.user_id,
  )
  console.log(checkFollowing)
  if (checkFollowing !== undefined) {
    const tweetQuery = `SELECT 
    tweet.tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply) AS replies, tweet.date_time AS dateTime
    FROM tweet 
    INNER JOIN reply 
    ON tweet.tweet_id = reply.tweet_id 
    INNER JOIN like 
    ON reply.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${tweetUserId.user_id};`
    const tweet = await db.get(tweetQuery)
    response.send(tweet)
    console.log(tweet)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API-7
app.get(
  '/tweets/:tweetId/likes/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const loggedinUserId = await db.get(loggedinUserIdQuery)
    console.log(loggedinUserId)
    const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const tweetUserId = await db.get(tweetUserIdQuery)
    console.log(tweetUserId)
    const followingQuery = `
  SELECT following_user_id AS user_id FROM follower WHERE follower_user_id = ${loggedinUserId.user_id};`
    const followingUserIds = await db.all(followingQuery)
    console.log(followingUserIds)
    const checkFollowing = followingUserIds.find(
      obj => obj.user_id === tweetUserId.user_id,
    )
    console.log(checkFollowing)
    if (checkFollowing !== undefined) {
      const likesQuery = `SELECT 
    user.name
    FROM tweet 
    INNER JOIN like 
    ON tweet.tweet_id = like.tweet_id 
    INNER JOIN user 
    ON user.user_id = like.user_id
    WHERE tweet.user_id = ${tweetUserId.user_id};`
      const likes = await db.all(likesQuery)
      response.send(
        likes.map(obj => {
          likes: [obj.name]
        }),
      )
      console.log(likes)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API - 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const loggedinUserId = await db.get(loggedinUserIdQuery)
    console.log(loggedinUserId)
    const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const tweetUserId = await db.get(tweetUserIdQuery)
    console.log(tweetUserId)
    const followingQuery = `
  SELECT following_user_id AS user_id FROM follower WHERE follower_user_id = ${loggedinUserId.user_id};`
    const followingUserIds = await db.all(followingQuery)
    console.log(followingUserIds)
    const checkFollowing = followingUserIds.find(
      obj => obj.user_id === tweetUserId.user_id,
    )
    console.log(checkFollowing)
    if (checkFollowing !== undefined) {
      const repliesQuery = `SELECT 
    user.name,reply.reply
    FROM user 
    INNER JOIN reply 
    ON user.user_id = reply.user_id 
    INNER JOIN tweet 
    ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${tweetUserId.user_id};`
      const replies = await db.all(repliesQuery)
      response.send(replies)
      console.log(replies)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

// API - 9
app.get('/user/tweets/', authenticationToken, async (request, response) => {
  const {username} = request
  const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const loggedinUserId = await db.get(loggedinUserIdQuery)
  console.log(loggedinUserId)
  usertweetsQuery = `
  SELECT tweet.tweet, COUNT(like.like_id) AS likes, COUNT(reply.reply) AS replies, tweet.date_time as dateTime
  FROM tweet
  INNER JOIN like 
  ON tweet.tweet_id = like.tweet_id
  INNER JOIN reply 
  ON tweet.tweet_id = reply.tweet_id
  WHERE tweet.user_id = ${loggedinUserId.user_id};`
  const userTweets = await db.all(usertweetsQuery)
  response.send(userTweets)
  console.log(userTweets)
})

//API-10

app.post('/user/tweets/', authenticationToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const loggedinUserId = await db.get(loggedinUserIdQuery)
  console.log(loggedinUserId)
  const createTweetQuery = `
  INSERT INTO
  tweet (tweet)
  VALUES
  ('${tweet}');`
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

//API-11

app.delete(
  '/tweets/:tweetId/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const loggedinUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const loggedinUserId = await db.get(loggedinUserIdQuery)
    console.log(loggedinUserId)
    const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const tweetUserId = await db.get(tweetUserIdQuery)
    console.log(tweetUserId)
    if (loggedinUserId.user_id === tweetUserId.user_id) {
      const deleteQuery = `
      DELETE FROM
      tweet
      WHERE 
      user_id = ${tweetUserId.user_id};`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
