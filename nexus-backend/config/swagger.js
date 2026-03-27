const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Business Nexus API',
      version: '1.0.0',
      description: 'Full backend API for Nexus — connecting Entrepreneurs & Investors',
      contact: { name: 'Nexus Team', email: 'dev@nexus.app' },
    },
    servers: [
      { url: 'http://localhost:5000/api', description: 'Local dev' },
      { url: 'https://nexus-backend.onrender.com/api', description: 'Production (Render)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js', './models/*.js'],
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, { explorer: true }));
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};
