const express = require('express');
const router = express.Router();
const kapController = require('../controllers/kap.controller');

router.get('/news', kapController.getNews);
router.get('/news/:id', kapController.getNewsAnalysis);
router.get('/anomalies', kapController.getAnomalies);
router.post('/update', kapController.updateNews);

module.exports = router;
