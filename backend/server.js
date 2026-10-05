import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        gemini: GEMINI_API_KEY ? "connected" : "missing key",
        openrouter: OPENROUTER_API_KEY ? "connected" : "missing key"
    });
});


/* =========================
   AI ANALYSIS
========================= */

app.post("/api/analyze", async (req, res) => {

    try {

        const { questions } = req.body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({
                error: "No questions were provided."
            });
        }

        const questionData = questions.map(q => ({
            number: q.number,
            text: q.text,
            marks: q.marks
        }));


        /* =========================
           PROMPT
        ========================= */

        const prompt = `

You are an academic question paper analysis assistant.

Analyze the following previous-year question paper questions.

IMPORTANT:

Base your analysis ONLY on the information present in these questions.

Do not invent topics that are unrelated to the question paper.


TASK 1 — SUBJECT

Identify the academic subject.

Give a confidence score between 0 and 1.


TASK 2 — TOPICS

Identify meaningful academic topics and concepts.

Group semantically similar questions under the same topic.

Do NOT create topics from generic words such as:

"Define"
"Explain"
"Method"
"Algorithm"
"Question"
"Value"

unless they represent a genuine academic concept.

For example:

Action-value function + state-value function
→ "Value Functions"

UCB + uncertainty in UCB
→ "Upper Confidence Bound (UCB)"

Gradient Bandit questions
→ "Gradient Bandit Algorithms"


For every topic provide:

- topic name
- short description
- question numbers
- frequency
- total marks
- priority
- reason for priority


PRIORITY RULES:

High:
Frequently asked OR high total marks OR both.

Medium:
Moderately important based on frequency and marks.

Low:
Appears rarely and has relatively low marks.


TASK 3 — STUDY RECOMMENDATIONS

Recommend the order in which the student should study the identified topics.

Rank them from 1 onwards.

Prioritize topics based on:

1. Frequency
2. Total marks
3. Importance of the concept


TASK 4 — EXPECTED QUESTIONS

Generate 10 likely exam questions.

These are NOT guaranteed questions.

They should be predictions based on:

- topics appearing repeatedly
- high-mark topics
- patterns in the uploaded questions
- concepts that have already appeared

Do not simply copy the original questions.

Rephrase them or create closely related questions that test the same concepts.

Include a mixture of short-answer and longer-answer style questions where appropriate.


TASK 5 — PRACTICE QUESTIONS

Generate 10 additional practice questions.

These should help the student prepare for the identified important topics.

Do NOT simply repeat the expected questions.

Create questions that test understanding and application of the same concepts.

Use different wording and scenarios where appropriate.


QUESTIONS:

${JSON.stringify(questionData, null, 2)}


Return ONLY valid JSON in the following structure:

{
    "subject": "string",
    "subject_confidence": 0.0,

    "topics": [
        {
            "name": "string",
            "description": "string",
            "question_numbers": ["string"],
            "frequency": 0,
            "total_marks": 0,
            "priority": "High",
            "reason": "string"
        }
    ],

    "recommendations": [
        {
            "topic": "string",
            "rank": 1,
            "reason": "string"
        }
    ],

    "expected_questions": [
        {
            "question": "string",
            "topic": "string",
            "reason": "string"
        }
    ],

    "practice_questions": [
        {
            "question": "string",
            "topic": "string"
        }
    ]
}

`;


        /* =====================================================
           TRY GEMINI FIRST
        ===================================================== */

        if (GEMINI_API_KEY) {

            try {

                console.log("Trying Gemini...");

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({

                            contents: [
                                {
                                    parts: [
                                        {
                                            text: prompt
                                        }
                                    ]
                                }
                            ],

                            generationConfig: {
                                temperature: 0.3,
                                responseMimeType: "application/json"
                            }

                        })
                    }
                );


                const data = await response.json();


                if (response.ok) {

                    const output =
                        data.candidates?.[0]?.content?.parts?.[0]?.text;


                    if (output) {

                        console.log("Gemini succeeded.");

                        const result = JSON.parse(output);

                        return res.json(result);
                    }
                }


                console.error(
                    "Gemini failed:",
                    data?.error?.message || "Unknown Gemini error"
                );

                console.log("Switching to OpenRouter...");

            } catch (geminiError) {

                console.error(
                    "Gemini exception:",
                    geminiError.message
                );

                console.log("Switching to OpenRouter...");
            }
        }


        /* =====================================================
           OPENROUTER FALLBACK
        ===================================================== */

        if (!OPENROUTER_API_KEY) {

            return res.status(500).json({
                error:
                    "Gemini failed and OPENROUTER_API_KEY is missing from .env"
            });
        }


        try {

            console.log("Trying OpenRouter free model...");


            const response = await fetch(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        "Authorization":
                            `Bearer ${OPENROUTER_API_KEY}`,

                        "HTTP-Referer":
                            "http://localhost:3000",

                        "X-Title":
                            "Question Paper Analyzer"
                    },

                    body: JSON.stringify({

                        model: "openrouter/free",

                        messages: [
                            {
                                role: "user",
                                content: prompt
                            }
                        ],

                        temperature: 0.3,

                        response_format: {
                            type: "json_object"
                        }

                    })
                }
            );


            const data = await response.json();


            if (!response.ok) {

                console.error(
                    "OPENROUTER ERROR:",
                    data
                );

                return res.status(response.status).json({
                    error:
                        data?.error?.message ||
                        "OpenRouter API request failed."
                });
            }


            const output =
                data.choices?.[0]?.message?.content;


            if (!output) {

                throw new Error(
                    "OpenRouter returned an empty response."
                );
            }


            const result = JSON.parse(output);


            console.log(
                "OpenRouter succeeded."
            );


            return res.json(result);


        } catch (openRouterError) {

            console.error(
                "OpenRouter ERROR:",
                openRouterError
            );

            return res.status(500).json({
                error:
                    openRouterError.message ||
                    "Both Gemini and OpenRouter failed."
            });
        }

    } catch (error) {

        console.error(
            "AI ERROR:",
            error
        );

        res.status(500).json({
            error:
                error.message ||
                "AI analysis failed."
        });
    }
});


/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

    console.log(
        `Server running on http://localhost:${PORT}`
    );

});