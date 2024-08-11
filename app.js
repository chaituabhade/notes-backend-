const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const path = require('path');
const userModel = require('./models/users');
const postModel = require('./models/post');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const flash = require('connect-flash');
const upload = require('./config/multerconfig');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const cors = require('cors');
const stripe = Stripe('sk_test_51PU2uCRx3Z2I9ltHkdoEqfFf3ZbPHqRP0MZQsrGtRhVf6wY6ky3mw7SKkbx5aUJ9tSOGkDWcSKUcHN6U3Na1bsd400F0KHmWEv');





app.use(bodyParser.urlencoded({ extended: true })); // To handle form submissions
app.use(bodyParser.json()); // To handle JSON data
app.use(cors());


app.use(cookieParser());


app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
 



app.get("/", function(req, res) {
    res.render("index");
});



app.post('/checkout', async (req, res) => {
  const { productName, productPrice } = req.body;
  
   console.log('Product Name:', productName); // Check if productName is correctly logged
   console.log('Product Price:', productPrice); // Check if productPrice is correctly logged

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
              {
                  price_data: {
                      currency: 'inr',
                      product_data: {
                          name: productName,
                      },
                      unit_amount: productPrice* 100,
                  },
                  quantity: 1,
              },
          ],
          mode: 'payment',
          success_url: `${req.headers.origin}/complete?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(productName)}`,
          cancel_url: `${req.headers.origin}/cancel`,
      });

      res.redirect(303, session.url); // Use 303 status code to handle redirects after POST
  } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).send('Error creating checkout session');
  }
});


// Complete endpoint
// Complete endpoint
app.get('/complete', async (req, res) => {
  
    // Redirect to profile page
    res.redirect('/paymentdone');
});

app.get("/paymentdone", isLoggedIn , function(req, res) {
  res.render("paymentdone");
});


// Cancel endpoint
app.get('/cancel', (req, res) => {
  res.redirect('/pricing');
});

// Session setup
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set secure to true if using https
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: '71200129981-boqkcn403vrn3d6rledvp4r336ncoq18.apps.googleusercontent.com',
  clientSecret: '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',
  callbackURL: 'http://localhost:3000/auth/google/callback',
},
async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('Profile received from Google:', profile); // Log profile data
    let user = await userModel.findOne({ googleId: profile.id });
    if (!user) {
      console.log('Creating new user...');
      user = await userModel.create({
        googleId: profile.id,
        username: profile.displayName,
        email: profile.emails[0].value,
      });
    } else {
      console.log('User found:', user);
    }
    return done(null, user);
  } catch (err) {
    console.error('Error in Google Strategy:', err); // Log the error
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await userModel.findById(id);
    console.log('Deserializing user:', user);
    done(null, user);
  } catch (err) {
    console.error('Error in deserializeUser:', err); // Log the error
    done(err, null);
  }
});

// Middleware to pass user data to views
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// Routes for Google authentication
app.get('/auth/google',
  (req, res, next) => {
    console.log('Initiating Google authentication');
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  (req, res, next) => {
    console.log('Google callback received');
    next();
  },
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    console.log('Authentication successful, redirecting to /profile');
    res.redirect('/profile');
  }
);

// Error handling route for login failure


app.get("/profile/upload",isLoggedIn, function(req, res) {
    res.render("profileupload");
});

app.get("/pricing", isLoggedIn, function(req, res) {
  const { productName, productPrice } = req.body;
  
   console.log('Product Name:', productName); // Check if productName is correctly logged
   console.log('Product Price:', productPrice); // Check if productPrice is correctly logged
  res.render("pricing");
});




app.post("/upload", isLoggedIn, upload.single("image"), async (req, res) => {
    try {
        // Validate the request
        if (!req.file) {
            console.error("No file uploaded");
            return res.status(400).send("No file uploaded");
        }
        console.log(req.user);
        if (!req.user.email) {
            console.error("Email is required");
            return res.status(400).send("Email is required");
        }

        // Log the email received
        console.log(`Email received: ${req.user.email}`);

        // Find the user
        let user = await userModel.findOne({ email: req.user.email });

        if (!user) {
            console.error(`User not found with email: ${req.user.email}`);
            return res.status(404).send("User not found");
        }

        // Update user's profile picture
        user.profilepic = req.file.filename;
        await user.save();

        console.log(`Profile picture updated for user: ${user.email}`);
        res.redirect("/profile");
    } catch (error) {
        console.error(`Error uploading profile picture: ${error.message}`);
        res.status(500).send("Internal Server Error");
    }
});                  



 
app.get('/profile',isLoggedIn, async (req, res) =>{
  //const user = req.user;
   
   let user = await userModel.findOne({email:req.user.email}).populate("posts");
    res.render("profile",{user})
    console.log('Product Name:', user.productName);
});

app.get('/likes/:id', isLoggedIn, async (req, res) => {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        let post = await postModel.findOne({ _id: req.params.id }).populate('likes');

        // Check if the user has already liked the post
        let likedIndex = post.likes.findIndex(like => like.equals(user._id));

        if (likedIndex === -1) {
            // User has not liked the post, so add the like
            post.likes.push(user._id);
        } else {
            // User has already liked the post, so remove the like (dislike)
            post.likes.splice(likedIndex, 1);
        }

        await post.save();
        res.redirect('/profile');
    } catch (err) {
        console.error('Error liking/disliking post:', err);
        res.redirect('/profile');
    }
});

app.get('/edit/:id', isLoggedIn, async (req, res) => {
    try {
        let post = await postModel.findOne({ _id: req.params.id }).populate("user");
        if (!post) {
            return res.status(404).send("Post not found");
        }
        res.render("edit", { post });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

// POST route for updating the post
app.post('/update/:id', isLoggedIn, async (req, res) => {
    try {
        let post = await postModel.findOneAndUpdate(
            { _id: req.params.id },
            { content: req.body.content },
            { new: true, runValidators: true }
        );

        if (!post) {
            return res.status(404).send("Post not found");
        }

        res.redirect("/profile");
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});



 


app.post('/post',isLoggedIn, async (req, res) =>{
    let user = await userModel.findOne({email:req.user.email});
    let {content} = req.body;

    let post = await postModel.create({
        user: user._id,
        content,
    });
    user.posts.push(post._id);
    await user.save(); 
    res.redirect("profile");

 });

 app.get('/delete/:id', isLoggedIn,  async (req, res) => {
    try {
        const postId = req.params.id;

        // Validate the post ID format
        if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
            console.error(`Invalid post ID format: ${postId}`);
            return res.status(400).send("Invalid post ID format");
        }

        // Find and delete the post
        const post = await postModel.findOneAndDelete({ _id: postId });

        if (!post) {
            console.error(`Post not found: ${postId}`);
            return res.status(404).send("Post not found");
        }

        console.log(`Post deleted successfully: ${postId}`);
        res.redirect("/profile");
    } catch (error) {
        console.error(`Error deleting post: ${error.message}`);
        res.status(500).send("Internal Server Error");
    }
});


app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err); // Handle error if needed
    }
    res.cookie("token","") ; // Clear express-session
    res.redirect('/login'); // Redirect to homepage or login page
  });
});



app.post('/login', async (req, res) =>{
   let user =  await userModel.findOne({email: req.body.email});
   if(!user){
    res.send("Somthing is wrong");
   }
   

   bcrypt.compare(req.body.password, user.password, (err,result)=>{
    if(result){
        let token = jwt.sign({email: user.email}, "secret");
        res.cookie("token", token);
            res.redirect("profile");
    }
    else{
        res.send( "wrong password");
    }
   });
});


app.get('/login',(req, res) =>{
    res.render('login')
});

app.post('/Create', async (req, res) =>{
    let{username, email, age , password, Name} = req.body;
    let user = await userModel.findOne({email});
    if(user){
        return res.status(500).send("User already registered");
    }

    bcrypt.genSalt(10, (err,salt) =>{
        bcrypt.hash(password, salt, async (err,hash)=>{
            let createduser = await userModel.create({
                username,
                Name,
                password: hash,
                age,
                email
            });

            let token = jwt.sign({email}, "secret");
            res.cookie("token", token);


            res.redirect("login");
        });
    });

  
});


function isLoggedIn(req, res, next) {
    
  
    const token = req.cookies.token;
    if (token) {
      jwt.verify(token, "secret", (err, decoded) => {
        if (err) {
          return res.redirect('/login');
        } else {
          req.user = decoded;
          return next();
        }
      });
    } else {
      res.redirect('/login');
    }
  }
//for protected routes
// function isLoggedIn(req,res, next){
//     if(req.cookies.token === ""){
//         res.redirect("login");
//     }
//     else{
//       let data =  jwt.verify(req.cookies.token, "secret");
//       req.user = data;
//       next();
//     }
    
// }


app.listen(3001);