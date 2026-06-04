const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./src/config/db');

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/subjects',  require('./src/routes/subjects'));
app.use('/api/topics',    require('./src/routes/topics'));
app.use('/api/schedule',  require('./src/routes/schedule'));
app.use('/api/sessions',  require('./src/routes/sessions'));
app.use('/api/quiz',      require('./src/routes/quiz'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/profile',   require('./src/routes/profile'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '🚀 SmartPlan API is running' });
});

// Global error handler
app.use(require('./src/middleware/errorHandler'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 SmartPlan server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
app.use('/api/ai', require('./src/routes/ai'));
