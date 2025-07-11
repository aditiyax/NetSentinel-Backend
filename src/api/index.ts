import express from 'express'
import { authMiddleware } from './middlewares/auth.middleware';
import { prisma } from "../db/src/index"
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());
// app.use("api/v1");


app.get('/', (req, res)=> {
  res.json({
    msg: "HI THERE !, Welcome to the Net-Sentinel Web Application's API"
  })
})


app.post('/api/v1/website', authMiddleware, async(req, res) => {
  const userId = req.userId!;
  const { url } = req.body;
  
 const data = await prisma.website.create({
    data: {
      userId,
      url
    }
  })

  console.log(`A Website with URL = '${url}' , was added !`);

  res.json({
    id: data.id
  })
});

app.get('/api/v1/website/status', authMiddleware, async(req, res) => {
  const websiteId = req.query.websiteId! as unknown as string;
  const userId = req.userId;

  const data = await prisma.website.findFirst({
    where: {
      id: websiteId,
      userId,
      disabled: false,   
    },
    include: {
      ticks: true
    }
  })

  res.json({
    data
  })
});

app.get('/api/v1/websites', authMiddleware, async(req, res) => {
  const userId = req.userId!;

  const websites = await prisma.website.findMany({ 
    where: {  
      userId,
      disabled: false
    },
    include: {
      ticks: true
    }
  })

  res.json({
    websites
  })
});

app.delete('/api/v1/website', authMiddleware, async(req, res) => {
  const websiteId = req.body.websiteId;
  const userId = req.userId!;

  await prisma.website.update({
    where: {
      id: websiteId,
      userId  
    },
    data: {
      disabled : true
    }
  })

  console.log(`A Website with ID = '${websiteId}' , was deleted !`);

  res.json({
    message: "Delted website succesfully"
  })
});

// Start the server
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the API at http://localhost:${PORT}`);
});