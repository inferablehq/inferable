#!/bin/bash

# Database name
DB_NAME="sample.db"

# Remove database if it exists
rm -f $DB_NAME

# Create database and tables using heredoc
sqlite3 $DB_NAME << 'END_SQL'
-- Create tables
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Insert sample data
INSERT INTO users (name, email) VALUES
    ('John Doe', 'john@example.com'),
    ('Jane Smith', 'jane@example.com'),
    ('Bob Wilson', 'bob@example.com');

INSERT INTO posts (user_id, title, content) VALUES
    (1, 'First Post', 'This is my first post content'),
    (1, 'Second Post', 'Another interesting post'),
    (2, 'Hello World', 'Jane''s first blog post'),
    (3, 'Tech Review', 'Review of the latest gadget');

INSERT INTO comments (post_id, user_id, content) VALUES
    (1, 2, 'Great first post!'),
    (1, 3, 'Welcome to the blog'),
    (2, 2, 'Interesting perspective'),
    (3, 1, 'Thanks for sharing'),
    (4, 2, 'Very informative review');

-- Create some indexes
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Show some sample queries
SELECT 'Sample Query 1: Posts with author names and comment counts';
SELECT
    p.title,
    u.name as author,
    COUNT(c.id) as comment_count
FROM posts p
JOIN users u ON p.user_id = u.id
LEFT JOIN comments c ON p.id = c.post_id
GROUP BY p.id
ORDER BY p.id;

SELECT '
Sample Query 2: Recent comments with post titles and commenter names';
SELECT
    c.content as comment,
    p.title as post_title,
    u.name as commenter
FROM comments c
JOIN posts p ON c.post_id = p.id
JOIN users u ON c.user_id = u.id
ORDER BY c.created_at DESC
LIMIT 5;
END_SQL

echo "Database $DB_NAME has been created with sample data!"
echo "You can connect to it using: sqlite3 $DB_NAME"
