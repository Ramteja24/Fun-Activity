// The Tech Trivia question bank. A quiz uses 5 of these; the rest stay for the next session.
// Server-side on purpose: the right answer is only sent to the browsers when the question is revealed.

export type TriviaCategory = 'Python' | 'AI' | 'SQL' | 'Git' | 'Cloud' | 'Software';

export interface TriviaItem {
  id: string;
  category: TriviaCategory;
  text: string;
  /** Always four options. */
  options: readonly [string, string, string, string];
  /** Index (0–3) of the right option. */
  correct: 0 | 1 | 2 | 3;
  explanation: string;
}

export const TRIVIA_BANK: readonly TriviaItem[] = [
  // Python
  {
    id: 'py-immutable',
    category: 'Python',
    text: 'Which of these Python data types is immutable?',
    options: ['list', 'dict', 'tuple', 'set'],
    correct: 2,
    explanation: 'A tuple cannot be changed after it is created; lists, dicts and sets can.',
  },
  {
    id: 'py-yield',
    category: 'Python',
    text: 'What does the `yield` keyword do in a Python function?',
    options: ['Ends the whole program', 'Makes it a generator that produces values one at a time', 'Imports a module', 'Raises an exception'],
    correct: 1,
    explanation: 'A function with `yield` returns a generator, which hands back one value per iteration.',
  },
  {
    id: 'py-slice',
    category: 'Python',
    text: 'What does `print(len([1, 2, 3][1:]))` output?',
    options: ['1', '2', '3', 'It raises an error'],
    correct: 1,
    explanation: '`[1, 2, 3][1:]` is `[2, 3]`, which has two elements.',
  },
  {
    id: 'py-pip',
    category: 'Python',
    text: 'Which command installs a package from PyPI?',
    options: ['python install requests', 'import requests', 'pypi get requests', 'pip install requests'],
    correct: 3,
    explanation: '`pip install <name>` downloads and installs a package from the Python Package Index.',
  },
  // AI
  {
    id: 'ai-llm',
    category: 'AI',
    text: 'What does LLM stand for in AI?',
    options: ['Linear Logic Machine', 'Large Language Model', 'Low-Level Memory', 'Layered Learning Method'],
    correct: 1,
    explanation: 'An LLM is a Large Language Model, such as the models behind modern chat assistants.',
  },
  {
    id: 'ai-overfit',
    category: 'AI',
    text: 'What is overfitting in machine learning?',
    options: ['The model memorises its training data and does poorly on new data', 'The model is too small to learn anything', 'The model trains too quickly', 'The data has too many columns'],
    correct: 0,
    explanation: 'An overfit model matches the training data too closely, so it generalises badly.',
  },
  {
    id: 'ai-rag',
    category: 'AI',
    text: 'In AI applications, what does RAG stand for?',
    options: ['Rapid Answer Generation', 'Recursive Agent Graph', 'Retrieval-Augmented Generation', 'Randomised Attention Gate'],
    correct: 2,
    explanation: 'RAG retrieves relevant documents and gives them to the model so its answer is grounded in them.',
  },
  {
    id: 'ai-attention',
    category: 'AI',
    text: 'Which mechanism lets a Transformer weigh how relevant each token is to every other token?',
    options: ['Convolution', 'Pooling', 'Dropout', 'Self-attention'],
    correct: 3,
    explanation: 'Self-attention scores every pair of tokens, which is the core idea of the Transformer.',
  },
  // SQL
  {
    id: 'sql-having',
    category: 'SQL',
    text: 'Which SQL clause filters groups after a GROUP BY?',
    options: ['WHERE', 'ORDER BY', 'HAVING', 'LIMIT'],
    correct: 2,
    explanation: 'WHERE filters rows before grouping; HAVING filters the groups afterwards.',
  },
  {
    id: 'sql-left-join',
    category: 'SQL',
    text: 'Which JOIN keeps every row of the left table, even when there is no match on the right?',
    options: ['INNER JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'LEFT JOIN'],
    correct: 3,
    explanation: 'A LEFT JOIN returns all left rows, with NULLs where the right side has no match.',
  },
  {
    id: 'sql-pk',
    category: 'SQL',
    text: 'What does a PRIMARY KEY guarantee?',
    options: ['Values are unique and never NULL', 'Values are sorted alphabetically', 'The column only holds text', 'The table has no other indexes'],
    correct: 0,
    explanation: 'A primary key identifies each row: it must be unique and cannot be NULL.',
  },
  {
    id: 'sql-truncate',
    category: 'SQL',
    text: 'Which statement removes every row from a table but keeps the table itself?',
    options: ['DROP TABLE', 'TRUNCATE TABLE', 'DELETE TABLE', 'REMOVE TABLE'],
    correct: 1,
    explanation: 'TRUNCATE TABLE empties the table; DROP TABLE would remove the table as well.',
  },
  // Git
  {
    id: 'git-checkout-b',
    category: 'Git',
    text: 'Which command creates a new branch and switches to it?',
    options: ['git checkout -b feature', 'git branch -d feature', 'git merge feature', 'git clone feature'],
    correct: 0,
    explanation: '`git checkout -b <name>` (or `git switch -c <name>`) creates the branch and moves onto it.',
  },
  {
    id: 'git-stash',
    category: 'Git',
    text: 'What does `git stash` do?',
    options: ['Deletes the last commit', 'Uploads commits to the remote', 'Temporarily shelves your uncommitted changes', 'Shows the commit history'],
    correct: 2,
    explanation: 'It saves your uncommitted work on a stack so you can get a clean working tree and come back to it later.',
  },
  {
    id: 'git-pull',
    category: 'Git',
    text: 'Which command downloads new commits from the remote and merges them into your current branch?',
    options: ['git push', 'git pull', 'git commit', 'git init'],
    correct: 1,
    explanation: '`git pull` is a fetch followed by a merge (or a rebase, if configured).',
  },
  {
    id: 'git-rebase',
    category: 'Git',
    text: 'What does `git rebase main` do when you run it on a feature branch?',
    options: ['Deletes the main branch', 'Pushes your branch to main', 'Squashes the whole repository into one commit', 'Replays your branch’s commits on top of main'],
    correct: 3,
    explanation: 'Rebase takes your commits and re-applies them on the tip of main, giving a linear history.',
  },
  // Cloud
  {
    id: 'cloud-s3',
    category: 'Cloud',
    text: 'Which AWS service provides object storage?',
    options: ['EC2', 'Lambda', 'S3', 'RDS'],
    correct: 2,
    explanation: 'Amazon S3 (Simple Storage Service) stores objects in buckets.',
  },
  {
    id: 'cloud-iaas',
    category: 'Cloud',
    text: 'What does IaaS stand for?',
    options: ['Internet as a Service', 'Infrastructure as a Service', 'Integration as a Service', 'Instance as a Server'],
    correct: 1,
    explanation: 'IaaS rents you infrastructure such as virtual machines, storage and networks.',
  },
  {
    id: 'cloud-serverless',
    category: 'Cloud',
    text: 'What does “serverless” computing mean?',
    options: ['You run code without managing servers; the provider scales it for you', 'There are no servers anywhere', 'Only desktop apps are used', 'The code runs offline'],
    correct: 0,
    explanation: 'Servers still exist, but the provider provisions, runs and scales them; you just supply code.',
  },
  {
    id: 'cloud-container',
    category: 'Cloud',
    text: 'What is a container image?',
    options: ['A screenshot of a server', 'A packaged, read-only template holding an app and its dependencies', 'A virtual monitor', 'A backup tape'],
    correct: 1,
    explanation: 'An image is the template a container is started from, so it runs the same everywhere.',
  },
  // general software development
  {
    id: 'dev-rest',
    category: 'Software',
    text: 'What does REST stand for?',
    options: ['Remote Execution Standard Transfer', 'Rapid Event Streaming Technology', 'Relational Entity Sync Tool', 'Representational State Transfer'],
    correct: 3,
    explanation: 'REST is an architectural style for web APIs built around resources and HTTP verbs.',
  },
  {
    id: 'dev-404',
    category: 'Software',
    text: 'Which HTTP status code means “Not Found”?',
    options: ['200', '301', '404', '500'],
    correct: 2,
    explanation: '404 means the server could not find the requested resource.',
  },
  {
    id: 'dev-cicd',
    category: 'Software',
    text: 'What does CI/CD stand for?',
    options: ['Continuous Integration / Continuous Delivery', 'Code Inspection / Code Deployment', 'Cloud Infrastructure / Cloud Data', 'Compile Immediately / Compile Daily'],
    correct: 0,
    explanation: 'CI builds and tests every change automatically; CD delivers the tested change to users.',
  },
  {
    id: 'dev-queue',
    category: 'Software',
    text: 'Which data structure works first-in, first-out?',
    options: ['Stack', 'Queue', 'Tree', 'Hash map'],
    correct: 1,
    explanation: 'A queue serves items in the order they arrived, like a line at a counter.',
  },
];
