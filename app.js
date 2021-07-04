require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const pug = require("pug");
const mongoose = require("mongoose");
const https = require("https");
const session = require("express-session")
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const request = require("request");
const Pusher = require("pusher");

const app = express();

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: false
}));
app.set("view engine", "pug");

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://admin-feel:" + process.env.ATLAS_PASSWORD + "@cluster0.i3uoc.mongodb.net/feelDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.set("useCreateIndex", true);

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_APP_KEY,
  secret: process.env.PUSHER_APP_SECRET,
  cluster: process.env.PUSHER_APP_CLUSTER
});

const postSchema = {
  post: String,
  likes: {
    type: Number,
    default: 0
  },
  date: {
    type: Date,
    default: Date.now()
  }
};

const Post = mongoose.model("post", postSchema);

const userSchema = new mongoose.Schema({
  password: String,
  googleId: String,
  facebookId: String,
  username: {
    type: String
  },
  fullname: String,
  dob: Date,
  mobileNumber: {
    type: String,
    default: ""
  },
  address: String,
  posts: [postSchema]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("user", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

//---- Creating Strategy For Authentication with Google and Facebook----------------------->

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID_GOOGLE,
    clientSecret: process.env.CLIENT_SECRET_GOOGLE,
    callbackURL: "https://feel8421.herokuapp.com/auth/google/userInfo",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      googleId: profile.id
    }, function(err, user) {
      User.updateOne({
        googleId: profile.id
      }, {
        $set: {
          username: profile.emails[0].value
        }
      }, (error) => {
        if (error) console.log(error);
      });
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.CLIENT_ID_FACEBOOK,
    clientSecret: process.env.CLIENT_SECRET_FACEBOOK,
    callbackURL: "https://feel8421.herokuapp.com/auth/facebook/userInfo",
    profileFields: ['id', 'displayName', 'photos', 'email']
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      facebookId: profile.id
    }, function(err, user) {
      console.log(user);
      // User.updateOne({googleId:profile.id},{$set:{email:profile.emails[0].value}},(error)=>{
      //   if(error) console.log(error);
      // });
      return cb(err, user);
    });
  }
));

// <--------------- End of Strategy -------------------------------------------------->

// <---------------- Home Route ------------------------------------------------>

app.get("/", (req, res) => {
  if (req.isAuthenticated())
    res.redirect("/userHome")
  else
    res.sendFile(__dirname + "/home.html");
});

// <--------------------------------- End of Home Route -------------------------------------------->


// <--------------------------- Sign In Route ------------------------------------------------------->


app.get("/signin", (req, res) => {
    res.render("signin", {
      notExist: false
    });
  })
  .post("/signin", function(req, res) {
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });
    req.login(user, function(err) {
      if (err) {
        console.log(err);
      } else {
        // ,{failureFlash:"Invalid username or password"}
        passport.authenticate("local")(req, res, function() {
          User.find({
            _id: req["user"]._id
          }, (err1, user) => {
            if (err1) console.log(err1);
            else {
              if (user[0].mobileNumber !== "") res.redirect("/userHome");
              else res.redirect("/userInfo");
            }
          });
          // else res.render("signin", {
          //   notExist: true
          // });
        });
      }
    });
  });

app.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"]
}));

app.get("/auth/google/userInfo",
  passport.authenticate("google", {
    failureRedirect: "/login"
  }),
  function(req, res) {
    // Successful authentication, redirect home.
    User.find({
      _id: req["user"]._id
    }, (err, user) => {
      if (err) console.log(err);
      else {
        // console.log(user);
        // console.log(user[0].mobileNumber);
        if (user[0].mobileNumber !== "") res.redirect("/userHome");
        else res.redirect("/userInfo");
      }
    });
  });

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/userInfo',
  passport.authenticate('facebook', {
    failureRedirect: "/login"
  }),
  function(req, res) {
    User.find({
      _id: req["user"]._id
    }, (err, user) => {
      if (err) console.log(err);
      else {
        if (user[0].mobileNumber !== "") res.redirect("/userHome");
        else res.redirect("/userInfo");
      }
    });
  });

// <------------------------------------- End of Sign In ----------------------------------->


// <---------------------------- Sign Up Route ------------------------------------------>

app.get("/signup", (req, res) => {
    res.render("signup", {
      exist: false
    });
  })
  .post("/signup", function(req, res) {
    const username = req.body.username;
    const password = req.body.password;
    const cpassword = req.body.cpassword;
    if (password === cpassword) {
      User.register({
        username: username
      }, password, function(err, user) {
        if (err) {
          console.log(err);
          res.render("signup", {
            exist: true
          });
        } else {
          passport.authenticate("local")(req, res, function() {
            // User.updateOne({username:username},{$set:{email:email}},(error)=>{
            //   if(error) console.log(error);
            //   else console.log("Successfully updated");
            // });
            res.redirect("/userInfo");
          });
        }
      });
    } else {
      res.redirect("/signup");
    }
  });

// <---------------------------------------- End of Sign Up ------------------------------------->



// <-------------------------------- User Information Route --------------------------------------->

app.get("/userInfo", (req, res) => {
    if (req.isAuthenticated()) {
      // console.log(req["user"]);
      res.sendFile(__dirname + "/feelInfo.html");
    } else {
      res.redirect("/signin");
    }
  })
  .post("/userInfo", (req, res) => {
    const name = req.body.name;
    const mobNumber = req.body.mobNumber;
    const dob = req.body.dob;
    const address = req.body.address;
    User.updateMany({
      _id: req["user"]._id
    }, {
      $set: {
        fullname: name,
        mobileNumber: mobNumber,
        dob: dob,
        address: address
      }
    }, (err) => {
      if (err) console.log(err);
      else res.redirect("/userHome");
    });
  });

// <------------------------------------ End of User Info --------------------------------->


// <---------------------------------- User Home Page Route ------------------------------>


app.get("/userHome", (req, res) => {
  if (req.isAuthenticated())
    res.sendFile(__dirname + "/userHome.html");
  else
    res.redirect("/");
});

// <----------------------------------- End of User Home ------------------------------>


// <---------------------------------- User Profile Page Route --------------------------->

app.get("/userProfile", (req, res) => {
  if (req.isAuthenticated()) {
    // console.log(req["user"]);
    User.find({
      _id: req["user"]._id
    }, (err, user) => {
      if (err) console.log(err);
      else res.render("userProfile", {
        user: user
      });
    });
  } else {
    res.redirect("/signin");
  }
});

app.post("/userPost", (req, res) => {
  // console.log("Hello");
  const newPost = req.body.newPost;
  const post = new Post({
    post: newPost
  });
  if (newPost !== "") {
    User.findOne({
      _id: req.user._id
    }, (err, user) => {
      if (err) console.log(err);
      else {
        user.posts.push(post);
        user.save();
        res.redirect("/userProfile");
      }
    });
  }
});

app.post("/userEditProfile", (req, res) => {
  const fullname = req.body.fullname;
  const dob = req.body.dob;
  const mobNumber = req.body.mobNumber;
  const address = req.body.address;
  User.updateMany({
    _id: req.user._id
  }, {
    $set: {
      fullname: fullname,
      dob: dob,
      mobileNumber: mobNumber,
      address: address
    }
  }, (err) => {
    if (err) console.log(err);
    else res.redirect("/userProfile");
  });
});

// <--------------------------------------------- End of User Profile ----------------------->


// <-------------------------------------------- Movies Page Route------------------------->

app.get("/movies", (req, res) => {
    if (req.isAuthenticated())
      res.render("movies", {
        movies: {
          results: [{
            title: "Movies will appear here"
          }]
        }
      });
    else res.redirect("/signin");
  })
  .post("/movies", (req, res) => {
    const val = req.body.button;
    const url = "https://api.themoviedb.org/3/search/movie?api_key=" + process.env.API_KEY_MOVIEDB + "&language=en-US&page=1&query=" + val;
    console.log(url);
    // https.get(url, (response) => {
    //   try {
    //     console.log(response.statusCode);
    //     response.on("data", (data) => {
    //       const list = JSON.parse(data);
    //       res.render("movies", {
    //         movies: list
    //       })
    //     });
    //   } catch (error) {
    //     console.log("Hello");
    //     console.log(error);
    //   }
    // });
    request.get(url, (err, response, data) => {
      if (!err && response.statusCode == 200) {
        var locals = JSON.parse(data);
        res.render("movies", {
          movies: locals
        });
      } else {
        console.log(response.statusCode);
      }
    });
  });

// <------------------------------------- End of Movies Route ------------------------------>


// <-------------------------------------------- Music Page Route------------------------->


app.get("/music", (req, res) => {
    if (req.isAuthenticated())
      res.render("music", {
        music: {
          results: {
            albummatches: {
              album: [{
                name: "Example1",
                artist: "Example1"
              }]
            }
          }
        }
      });
    else res.redirect("/signin");
  })
  .post("/music", (req, res) => {
    const val = req.body.button;
    const url = "https://ws.audioscrobbler.com/2.0/?method=album.search&album=" + val + "&api_key=" + process.env.API_KEY_MUSIC + "&format=json&limit=10";
    request.get(url, (err, response, data) => {
      if (!err && response.statusCode == 200) {
        var locals = JSON.parse(data);
        res.render("music", {
          music: locals
        });
      }
    });
  });



// <------------------------------------- End of Music Route ------------------------------>



// <-------------------------------------------- Books Page Route------------------------->


app.get("/books", (req, res) => {
    if (req.isAuthenticated())
      res.render("books", {
        books: {
          items: [{
            volumeInfo: {
              title: "Example title",
              authors: ["By ABCD"]
            }
          }]
        }
      });
    else res.redirect("/signin");
  })
  .post("/books", (req, res) => {
    const val = req.body.button;
    const url = "https://www.googleapis.com/books/v1/volumes?q=" + val;
    request.get(url, (err, response, data) => {
      if (!err && response.statusCode == 200) {
        var locals = JSON.parse(data);
        res.render("books", {
          books: locals
        });
      }
    });
  });


// <------------------------------------- End of Books Route ------------------------------>



// <-------------------------------------------- Games Page Route------------------------->


app.get("/games", (req, res) => {
    if (req.isAuthenticated())
      res.render("games", {
        games: {
          results: [{
            name: "Games will appear here"
          }]
        }
      });
    else res.redirect("/signin");
  })
  .post("/games", (req, res) => {
    const val = req.body.button;
    const url = "https://api.rawg.io/api/games?key=" + process.env.API_KEY_GAMES + "&page_size=10&search=" + val;
    request.get(url, (err, response, data) => {
      if (!err && response.statusCode == 200) {
        var locals = JSON.parse(data);
        res.render("games", {
          games: locals
        });
      }
    });
  });



// <------------------------------------- End of Games Route ------------------------------>


// <------------------------------------ Posts Route ------------------------------------->

app.get("/posts", (req, res) => {
  if (req.isAuthenticated()) {
    User.find({}, (err, users) => {
      if (err) console.log(err);
      else
        res.render("posts", {
          users: users
        });
    });
  } else {
    res.render("signin");
  }
});

app.post("/posts/:id/act", (req, res) => {
  const action = req.body.act;
  const counter = action === "Like" ? 1 : -1;
  User.find({}, (err, users) => {
    users.forEach((user) => {
      user.posts.forEach((post) => {
        const iD = (post._id).toString();
        if (iD === req.params.id) {
          post.likes = post.likes + counter;
          user.save();
          pusher.trigger("post-events", "postAction", {
            action: action,
            postId: req.params.id
          }, req.body.socketId);
          res.send("");
        }
      });
    })
  });
});


// <-------------------------------------------- LogOut Page Route------------------------->


app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
});


// <------------------------------------- End of Logout Route ------------------------------>


// <----------------------------------- Starting the Server ------------------------>

let port = process.env.PORT;
if (port === "" || port === null) {
  port = 3000;
}

app.listen(port, function() {
  console.log("Server started on port");
});