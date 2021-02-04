## Jamstack ECommerce Next

### Important!

This is a fork from [Nader's Jamstack Ecommerce Next][https://github.com/jamstack-cms/jamstack-ecommerce]. He has done all the work with setting up and building the UI among other things. This fork shows you how you can add a backend using Prisma using any dialect supported.

## Getting Started

Start by cloning and installing dependacies.

`$ git clone https://github.com/joeynimu/jamstack-ecommerce.git`

Navigate to the root of the cloned project folder and run
`$ yarn` if you are using yarn or `$ npm install` if you are using npm

By default, the project is configured to use `sqlite` but you can change this to point to a `PostgreSQL` db instance or any other support dialect.

First you'd need to setup the db table structure by running `$ yarn push-db`. This will create an SQLite database for you and sync it with your schema that is defined inside the `prisma/schema.prisma` file. This data uses a file `db` stored in the `prisma` directory.

At this point your database is in place but there's no data in it. There's a script in place that will `seed (add sample data for you)`. You can achieve this by running `$ yarn seed-db`. This will create some sample data for you to get you started.

Prisma comes with useful tool called Studio, it lets you view your tables and make any CRUD operations if you wish. To open studio run `$ yarn db-studio`, here you'll be able to view and edit your data.

If you have done the above steps successfully, you are now ready to run the client with `$ yarn dev`
