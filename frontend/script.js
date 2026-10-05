// ==========================================
// QUESTION PAPER ANALYZER - SCRIPT.JS
// ==========================================


// ==========================================
// DOM ELEMENTS
// ==========================================

const pdfInput =
    document.getElementById("pdfInput");

const analyzeBtn =
    document.getElementById("analyzeBtn");

const detectedSubject =
    document.getElementById("detectedSubject");

const topicResults =
    document.getElementById("topicResults");

const recommendationResults =
    document.getElementById("recommendationResults");

const expectedResults =
    document.getElementById("expectedResults");

const practiceResults =
    document.getElementById("practiceResults");


// ==========================================
// PDF.JS SETUP
// ==========================================

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


// ==========================================
// BACKEND URL
// ==========================================

const API_URL = "http://localhost:3000";


// ==========================================
// ANALYZE BUTTON
// ==========================================

analyzeBtn.addEventListener(
    "click",
    analyzePapers
);


// ==========================================
// MAIN ANALYSIS FUNCTION
// ==========================================

async function analyzePapers() {

    const files =
        Array.from(pdfInput.files);


    if (files.length === 0) {

        alert(
            "Please upload at least one PDF."
        );

        return;
    }


    try {

        analyzeBtn.disabled = true;

        analyzeBtn.textContent =
            "Analyzing...";


        topicResults.innerHTML =
            "<p>Reading question papers...</p>";


        recommendationResults.innerHTML =
            "<p>Generating recommendations...</p>";


        expectedResults.innerHTML =
            "<p>Generating expected questions...</p>";


        practiceResults.innerHTML =
            "<p>Generating practice questions...</p>";


        detectedSubject.textContent =
            "Detecting subject...";


        let allQuestions = [];


        // ==================================
        // READ ALL PDFs
        // ==================================

        for (const file of files) {

            const text =
                await extractPDFText(file);


            const questions =
                parseQuestions(text);


            allQuestions.push(

                ...questions.map(q => ({

                    ...q,

                    fileName: file.name

                }))

            );

        }


        // ==================================
        // CHECK QUESTIONS
        // ==================================

        if (allQuestions.length === 0) {

            detectedSubject.textContent =
                "Could not detect questions.";


            topicResults.innerHTML =
                "<p>No questions could be extracted from the uploaded PDFs.</p>";


            recommendationResults.innerHTML =
                "<p>No recommendations available.</p>";


            expectedResults.innerHTML =
                "<p>No expected questions available.</p>";


            practiceResults.innerHTML =
                "<p>No practice questions available.</p>";


            return;
        }


        // ==================================
        // SEND TO AI
        // ==================================

        const analysis =
            await analyzeWithAI(allQuestions);


        // ==================================
        // DISPLAY RESULTS
        // ==================================

        displaySubject(analysis);

        displayTopics(analysis);

        displayRecommendations(analysis);

        displayExpectedQuestions(analysis);

        displayPracticeQuestions(analysis);


    } catch (error) {

        console.error(error);


        detectedSubject.textContent =
            "Analysis failed.";


        topicResults.innerHTML =
            `<p>${escapeHTML(error.message)}</p>`;


        recommendationResults.innerHTML =
            "<p>Unable to generate recommendations.</p>";


        expectedResults.innerHTML =
            "<p>Unable to generate expected questions.</p>";


        practiceResults.innerHTML =
            "<p>Unable to generate practice questions.</p>";


    } finally {

        analyzeBtn.disabled = false;

        analyzeBtn.textContent =
            "Analyze";

    }

}


// ==========================================
// EXTRACT TEXT FROM PDF
// ==========================================

async function extractPDFText(file) {

    const arrayBuffer =
        await file.arrayBuffer();


    const pdf =
        await pdfjsLib.getDocument({
            data: arrayBuffer
        }).promise;


    let fullText = "";


    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {

        const page =
            await pdf.getPage(pageNumber);


        const content =
            await page.getTextContent();


        const pageText =
            content.items
                .map(item => item.str)
                .join(" ");


        fullText +=
            `\n${pageText}\n`;

    }


    return fullText;

}


// ==========================================
// PARSE QUESTIONS
// ==========================================

function parseQuestions(text) {


    // Remove Course Outcome / Bloom table

    const cutoffRegex =
        /Course\s+Outcome\s*\/\s*Bloom/i;


    const cutoffMatch =
        text.search(cutoffRegex);


    if (cutoffMatch !== -1) {

        text =
            text.substring(
                0,
                cutoffMatch
            );

    }


    text =
        text
            .replace(/\r/g, " ")
            .replace(/\n+/g, " ")
            .replace(/\s+/g, " ")
            .trim();


    // ==================================
    // FIND MAIN QUESTIONS
    // ==================================

    const questionRegex =
        /(?:^|\s)(\d{1,2})\s*[\.\)]\s*/g;


    const matches = [];


    let match;


    while (
        (match =
            questionRegex.exec(text)) !== null
    ) {

        const number =
            parseInt(match[1]);


        if (
            number >= 1 &&
            number <= 50
        ) {

            matches.push({

                number,

                index:
                    match.index +
                    match[0].length

            });

        }

    }


    // ==================================
    // KEEP SEQUENTIAL NUMBERS
    // ==================================

    const validMatches = [];


    let expectedNumber = 1;


    for (const item of matches) {

        if (
            item.number ===
            expectedNumber
        ) {

            validMatches.push(item);

            expectedNumber++;

        }

    }


    const questions = [];


    // ==================================
    // EXTRACT EACH QUESTION
    // ==================================

    for (
        let i = 0;
        i < validMatches.length;
        i++
    ) {

        const current =
            validMatches[i];


        const next =
            validMatches[i + 1];


        let questionText;


        if (next) {

            questionText =
                text.substring(

                    current.index,

                    next.index -
                    String(next.number).length -
                    2

                );

        } else {

            questionText =
                text.substring(
                    current.index
                );

        }


        questionText =
            cleanQuestionText(
                questionText
            );


        if (!questionText) {
            continue;
        }


        // ==================================
        // CHECK SUBQUESTIONS
        // ==================================

        const subQuestions =
            parseSubQuestions(
                questionText
            );


        if (
            subQuestions.length > 0
        ) {

            subQuestions.forEach(sub => {

                questions.push({

                    number:
                        `${current.number}${sub.label}`,

                    text:
                        sub.text,

                    marks:
                        sub.marks

                });

            });


        } else {

            questions.push({

                number:
                    String(current.number),

                text:
                    questionText,

                marks:
                    findMarks(questionText)

            });

        }

    }


    return questions;

}


// ==========================================
// PARSE SUBQUESTIONS
// ==========================================

function parseSubQuestions(text) {

    const regex =
        /(?:^|\s)([a-z])\s*[\.\)]\s*/gi;


    const matches = [];


    let match;


    while (
        (match =
            regex.exec(text)) !== null
    ) {

        matches.push({

            label:
                match[1].toLowerCase(),

            index:
                match.index +
                match[0].length

        });

    }


    if (matches.length < 2) {
        return [];
    }


    const results = [];


    for (
        let i = 0;
        i < matches.length;
        i++
    ) {

        const current =
            matches[i];


        const next =
            matches[i + 1];


        let subText;


        if (next) {

            subText =
                text.substring(

                    current.index,

                    next.index - 2

                );

        } else {

            subText =
                text.substring(
                    current.index
                );

        }


        subText =
            cleanQuestionText(
                subText
            );


        if (!subText) {
            continue;
        }


        results.push({

            label:
                current.label,

            text:
                subText,

            marks:
                findMarks(subText)

        });

    }


    return results;

}


// ==========================================
// FIND MARKS
// ==========================================

function findMarks(text) {

    const patterns = [

        /\[\s*(\d+(?:\.\d+)?)\s*(?:marks?)?\s*\]/i,

        /\(\s*(\d+(?:\.\d+)?)\s*(?:marks?)?\s*\)/i,

        /(\d+(?:\.\d+)?)\s*marks?/i

    ];


    for (const pattern of patterns) {

        const match =
            text.match(pattern);


        if (match) {

            return Number(
                match[1]
            );

        }

    }


    return 0;

}


// ==========================================
// CLEAN QUESTION TEXT
// ==========================================

function cleanQuestionText(text) {

    return text

        .replace(
            /Page\s+\d+\s+of\s+\d+/gi,
            ""
        )

        .replace(
            /\bPART\s+[A-Z]\b/gi,
            ""
        )

        .replace(
            /\[\s*CO\s*\d+\s*\]/gi,
            ""
        )

        .replace(
            /\[\s*BTL\s*\d+\s*\]/gi,
            ""
        )

        .replace(
            /\[\s*BLT\s*\d+\s*\]/gi,
            ""
        )

        .replace(

            /\[\s*\d+(?:\.\d+)?\s*(?:marks?)?\s*\]\s*$/i,

            ""

        )

        .replace(
            /\s+/g,
            " "
        )

        .trim();

}


// ==========================================
// SEND QUESTIONS TO AI
// ==========================================

async function analyzeWithAI(questions) {

    const response =
        await fetch(

            `${API_URL}/api/analyze`,

            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body:
                    JSON.stringify({

                        questions

                    })

            }

        );


    if (!response.ok) {

        let message =
            `Server error (${response.status})`;


        try {

            const errorData =
                await response.json();


            if (errorData.error) {

                message =
                    errorData.error;

            }

        } catch (_) {}


        throw new Error(message);

    }


    return await response.json();

}


// ==========================================
// DISPLAY SUBJECT
// ==========================================

function displaySubject(analysis) {

    const subject =
        analysis.subject ||
        "Unknown Subject";


    const confidence =
        Number(
            analysis.subject_confidence
        );


    let confidenceText = "";


    if (!Number.isNaN(confidence)) {

        confidenceText =
            ` (${Math.round(
                confidence * 100
            )}% confidence)`;

    }


    detectedSubject.innerHTML = `

        <strong>
            ${escapeHTML(subject)}
        </strong>

        ${escapeHTML(confidenceText)}

    `;

}


// ==========================================
// DISPLAY TOPICS
// ==========================================

function displayTopics(analysis) {

    const topics =
        analysis.topics || [];


    if (topics.length === 0) {

        topicResults.innerHTML =
            "<p>No meaningful topics were identified.</p>";

        return;

    }


    topicResults.innerHTML = "";


    topics.forEach(
        (topic, index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "topic-card";


            const priorityClass =
                `priority-${String(
                    topic.priority ||
                    "low"
                ).toLowerCase()}`;


            card.innerHTML = `

                <h3>
                    ${index + 1}.
                    ${escapeHTML(
                        topic.name
                    )}
                </h3>

                <p>
                    <strong>
                        Concept:
                    </strong>

                    ${escapeHTML(
                        topic.description ||
                        "—"
                    )}
                </p>

                <p>
                    <strong>
                        Frequency:
                    </strong>

                    ${Number(
                        topic.frequency
                    ) || 0}
                </p>

                <p>
                    <strong>
                        Total Marks:
                    </strong>

                    ${Number(
                        topic.total_marks
                    ) || 0}
                </p>

                <p class="${priorityClass}">

                    <strong>
                        Priority:
                    </strong>

                    ${escapeHTML(
                        topic.priority ||
                        "Low"
                    )}

                </p>

                <p>

                    <strong>
                        Why:
                    </strong>

                    ${escapeHTML(
                        topic.reason ||
                        "—"
                    )}

                </p>

            `;


            topicResults.appendChild(
                card
            );

        }
    );

}


// ==========================================
// DISPLAY RECOMMENDATIONS
// ==========================================

function displayRecommendations(
    analysis
) {

    const recommendations =
        analysis.recommendations ||
        [];


    if (
        recommendations.length === 0
    ) {

        recommendationResults.innerHTML =
            "<p>No recommendations available.</p>";

        return;

    }


    recommendationResults.innerHTML =
        "";


    recommendations

        .sort(
            (a, b) =>
                Number(a.rank) -
                Number(b.rank)
        )

        .forEach(rec => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "recommendation-card";


            card.innerHTML = `

                <h3>

                    #${Number(
                        rec.rank
                    ) || ""}

                    ${escapeHTML(
                        rec.topic
                    )}

                </h3>

                <p>

                    ${escapeHTML(
                        rec.reason ||
                        ""
                    )}

                </p>

            `;


            recommendationResults
                .appendChild(card);

        });

}


// ==========================================
// DISPLAY EXPECTED QUESTIONS
// ==========================================

function displayExpectedQuestions(
    analysis
) {

    const questions =
        analysis.expected_questions ||
        [];


    if (questions.length === 0) {

        expectedResults.innerHTML =
            "<p>No expected questions were generated.</p>";

        return;

    }


    expectedResults.innerHTML = "";


    questions.forEach(
        (item, index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "expected-card";


            card.innerHTML = `

                <h3>
                    Expected Question ${index + 1}
                </h3>

                <p>

                    <strong>
                        ${escapeHTML(
                            item.question ||
                            ""
                        )}
                    </strong>

                </p>

                <p>

                    <strong>
                        Topic:
                    </strong>

                    ${escapeHTML(
                        item.topic ||
                        "—"
                    )}

                </p>

                <p>

                    <strong>
                        Why:
                    </strong>

                    ${escapeHTML(
                        item.reason ||
                        "Based on previous-year patterns."
                    )}

                </p>

            `;


            expectedResults.appendChild(
                card
            );

        }
    );

}


// ==========================================
// DISPLAY PRACTICE QUESTIONS
// ==========================================

function displayPracticeQuestions(
    analysis
) {

    const questions =
        analysis.practice_questions ||
        [];


    if (questions.length === 0) {

        practiceResults.innerHTML =
            "<p>No practice questions were generated.</p>";

        return;

    }


    practiceResults.innerHTML = "";


    questions.forEach(
        (item, index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "practice-card";


            card.innerHTML = `

                <h3>
                    Practice Question ${index + 1}
                </h3>

                <p>

                    <strong>
                        ${escapeHTML(
                            item.question ||
                            ""
                        )}
                    </strong>

                </p>

                <p>

                    <strong>
                        Topic:
                    </strong>

                    ${escapeHTML(
                        item.topic ||
                        "—"
                    )}

                </p>

            `;


            practiceResults.appendChild(
                card
            );

        }
    );

}


// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHTML(value) {

    return String(value ?? "")

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}