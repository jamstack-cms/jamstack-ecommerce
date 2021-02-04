## Jamstack ECommerce Next

### Important!

This is a fork from [Nader's Jamstack Ecommerce Next](https://github.com/jamstack-cms/jamstack-ecommerce). He has done all the work with setting up and building the UI among other things. This fork shows you how you can add a backend using Prisma using any supported database dialect.

## Getting Started

### Clone and Install Dependancies

Start by cloning and installing dependacies.

- `$ git clone https://github.com/joeynimu/jamstack-ecommerce.git`

- `$ yarn` if you are using yarn or `$ npm install` if you are using npm

- `$ yarn push-db`: Creates the db structure
- `$ yarn seed-db`: Adds some sample data for you to start with
- `$ yarn dev`: Runs the NexJS application that reads data from your database
- `$ yarn db-studio`: Opens Prisma Studio wher you can view and edit your database

### Backend Details

By default, the project is configured to use `sqlite` but you can change this to point to a `PostgreSQL` db instance or any other support dialect.
