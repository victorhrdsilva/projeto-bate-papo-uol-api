import express from "express";
import cors from 'cors';
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from 'joi';
import dayjs from 'dayjs';
import AdvancedFormat from 'dayjs/plugin/advancedFormat.js';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
dayjs.extend(AdvancedFormat);


const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
    db = mongoClient.db("bate-papo-uol");
});

setInterval(async ()  => {
    try {
        const promisse = await db.collection("participants").find().toArray();
        promisse.map(async(item) => {
            const id = item._id
            if(item.lastStatus < (Date.now()-10000)) {
                await db.collection("participants").deleteOne({_id: id});
                await db.collection("messages").insertOne({
                    from: item.name, 
                    to: 'Todos', 
                    text: 'sai da sala...', 
                    type: 'status', 
                    time: dayjs().format("HH:mm:ss")
                });
            }
        })
    } catch (error) {
        console.log("erro")
    }
}, 15000)

// USER MANIPULATION

app.post("/", async (req, res) => {
    const nameSchema = joi.object({
        name: joi.string().required().empty(' '),
        lastStatus: joi.required()
    });

    const body = req.body;
    let newUser = {
        ...body,
        lastStatus: Date.now()
    };

    const validation = nameSchema.validate(newUser, { abortEarly: false });

    if (validation.error) {
        const erros = validation.error.details.map((detail) => detail.message);
        res.status(422).send(erros);
        return;
    }

    const isRepeatName = await db.collection("participants").find({ name: newUser.name }).toArray();

    if (isRepeatName.length > 0) {
        res.status(409).send("O nome de usuário já existe");
        return;
    }

    const message = {
        from: newUser.name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time: dayjs().format("HH:mm:ss")
    };

    try {
        await db.collection("participants").insertOne(newUser);
        await db.collection("messages").insertOne(message);
        res.sendStatus(201);
    } catch (error) {
        res.sendStatus(500);
    }

});

app.get("/participants", async (req, res) => {
    try {
        const promisse = await db.collection("participants").find().toArray();
        res.status(201).send(promisse);
    } catch (error) {
        res.sendStatus(500);
    }
});

// MESSAGE HANDLING

app.post("/messages", async (req, res) => {
    const messageSchema = joi.object({
        from: joi.string().required().empty(' '),
        to: joi.string().required().empty(' '),
        text: joi.string().required().empty(' '),
        type: joi.any().valid('message', 'private_message'),
        time: joi.required(),

    });


    const user = req.headers.user;
    let body = req.body;
    let newMessage = {
        ...body,
        time: dayjs().format("HH:mm:ss"),
        from: user
    };

    const validation = messageSchema.validate(newMessage, { abortEarly: false });

    if (validation.error) {
        const erros = validation.error.details.map((detail) => detail.message);
        res.status(422).send(erros);
        return;
    }

    const isExistFrom = await db.collection("participants").find({ name: user }).toArray();

    if (isExistFrom.length === 0) {
        res.status(422).send("Usuário inexistente");
        return;
    }

    try {
        const promisse = await db.collection("messages").insertOne(newMessage);
        res.sendStatus(201);
    } catch (error) {
        res.sendStatus(500);
    }

});

app.get("/messages", async (req, res) => {
    const limit = parseInt(req.query.limit);
    console.log(limit)
    const user = req.headers.user;

    try {
        const promisse = await db.collection("messages").find().toArray();
        const messagesFromUser = promisse.filter((item) => {
            return (item.to == user || item.from == user || item.type == "message" || item.type == "status")
        })
        if (limit > 0) {
            res.status(201).send(messagesFromUser.slice(-limit));
            return
        }
        res.status(201).send(messagesFromUser);
    } catch (error) {
        res.sendStatus(500);
    }
});

// STATUS 

app.post("/status", async (req, res) => {
    const user = req.headers.user;
    try {
        const findedUser = await db.collection("participants").find({ name: user }).toArray();

        if (findedUser.length == 0) {
            res.status(404).send("Falha ao encontrar o usuário");
            return;
        }

        const promisse = await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() }});;
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
});


app.listen(5000);