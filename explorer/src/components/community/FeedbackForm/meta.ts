console.log( process.env.REACT_APP_FEEDBACK_FORM_URL);

const endpoints = {
    FEEDBACK: process.env.REACT_APP_FEEDBACK_FORM_URL ?? "",
};

const MINIMUM_FEEDBACK_TEXT_LENGTH = 10;

export { endpoints, MINIMUM_FEEDBACK_TEXT_LENGTH };
