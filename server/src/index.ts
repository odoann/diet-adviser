import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { DataTypes, Sequelize } from "sequelize";
import { html, raw } from "hono/html";
import { Session, sessionMiddleware, CookieStore } from "hono-sessions";
import { cors } from "hono/cors";

const port = 3000;

const app = new Hono<{
  Variables: {
    session: Session;
    session_key_rotation: boolean;
  };
}>();

const store = new CookieStore();

app.use("*", cors());
app.use(
  "*",
  sessionMiddleware({
    store,
    encryptionKey: "password_at_least_32_characters_long", // Required for CookieStore, recommended for others
    expireAfterSeconds: 900, // Expire session after 15 minutes of inactivity
    cookieOptions: {
      sameSite: "Lax", // Recommended for basic CSRF protection in modern browsers
      path: "/", // Required for this library to work properly
      httpOnly: true, // Recommended to avoid XSS attacks
    },
  })
);

type RegisterValues = {
  email: string;
  firstname: string;
  lastname: string;
  password: string;
};

type LoginValues = Pick<RegisterValues, "email" | "password">;

const sequelize = new Sequelize("bmi_db", "root", "", {
  host: "localhost",
  dialect: "mysql",
});

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    firstname: {
      type: DataTypes.TEXT,
    },
    lastname: {
      type: DataTypes.TEXT,
    },
    email: {
      type: DataTypes.TEXT,
    },
    password: {
      type: DataTypes.TEXT,
    },
  },
  {
    timestamps: false,
  }
);

app.get("/", async (c, next) => {
  const sessionStore = c.get("session");

  if (sessionStore.get("counter")) {
    sessionStore.set("counter", (sessionStore.get("counter") as number) + 1);
  } else {
    sessionStore.set("counter", 1);
  }

  return c.html(
    `<h1>You have visited this page ${sessionStore.get("counter")} times</h1>`
  );
});

app.post("/register", async (c) => {
  const sessionStore = c.get("session");
  // let userSession = sessionStore.get("sid");

  const request_body = await c.req.json<RegisterValues>();

  if (!request_body) {
    return c.json(
      {
        message:
          "Please provide the request body in order to register an account.",
        data: null,
        redirect: false,
      },
      404
    );
  }

  const does_user_exist = await User.findOne({
    where: {
      email: request_body.email,
    },
  });

  if (does_user_exist) {
    sessionStore.set(
      "sid",
      JSON.stringify({
        email: request_body.email,
        password: request_body.password,
      } as Pick<RegisterValues, "email" | "password">)
    );
    return c.json(
      {
        message: "You already have an account, please login.",
        data: null,
        redirect: false,
      },
      200
    );
  }

  const new_record = await User.create({
    email: request_body.email,
    firstname: request_body.firstname,
    lastname: request_body.lastname,
    password: request_body.password,
  });

  if (!new_record) {
    return c.json(
      {
        message: "Could not save record",
        data: [],
        redirect: false,
      },
      404
    );
  }

  sessionStore.set(
    "sid",
    JSON.stringify({
      email: request_body.email,
      password: request_body.password,
    } as Pick<RegisterValues, "email" | "password">)
  );

  return c.json({
    message: "Registration success.",
    data: [],
    redirect: true,
  });
});

app.post("/login", async (c) => {
  // const sessionStore = c.get("session");
  // let userSession = sessionStore.get("sid");
  const request_body = await c.req.json<LoginValues>();

  if (!request_body) {
    return c.json(
      {
        message: "Please provide the request body in order to login.",
        data: null,
        redirect: false,
      },
      404
    );
  }

  const does_user_exist = await User.findOne({
    where: {
      email: request_body.email,
    },
  });

  if (!does_user_exist) {
    return c.json(
      {
        message: "You do not have an account, please register.",
        data: null,
        redirect: false,
      },
      404
    );
  }

  // sessionStore.set(
  //   "sid",
  //   JSON.stringify({
  //     email: request_body.email,
  //     password: request_body.password,
  //   } as Pick<RegisterValues, "email" | "password">)
  // );

  return c.json({
    message: "You logged in successfully.",
    data: does_user_exist,
    redirect: true,
  });
});

app.get("/auth/bmi/:email", async (c) => {
  const email = c.req.param("email");

  const does_user_exist = await User.findOne({
    where: {
      email,
    },
  });

  if (!does_user_exist) {
    return c.redirect("/not-authorized");
  }

  return c.html(
    html`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>Advanced BMI Calculator</title>
          <!-- <link rel="stylesheet" href="styles.css" /> -->
        </head>
        <body>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f0f0f0;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }

            .container {
              background-color: #ffffff;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              width: 300px;
              text-align: center;
            }

            h1 {
              margin-bottom: 20px;
            }

            .input-group {
              margin-bottom: 15px;
            }

            input[type="number"],
            select {
              width: 100%;
              padding: 10px;
              margin-top: 5px;
              border: 1px solid #ccc;
              border-radius: 4px;
            }

            button {
              background-color: #007bff;
              color: white;
              border: none;
              padding: 10px;
              width: 100%;
              border-radius: 4px;
              cursor: pointer;
            }

            button:hover {
              background-color: #0056b3;
            }

            #result {
              margin-top: 20px;
              font-size: 18px;
            }
          </style>
          <div class="container">
            <h1>Advanced BMI Calculator</h1>
            <div class="calculator">
              <div class="input-group">
                <label for="weight">Weight (kg):</label>
                <input
                  type="number"
                  id="weight"
                  placeholder="Enter your weight"
                />
              </div>
              <div class="input-group">
                <label for="height">Height (cm):</label>
                <input
                  type="number"
                  id="height"
                  placeholder="Enter your height"
                />
              </div>
              <div class="input-group">
                <label for="gender">Gender:</label>
                <select id="gender">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <button onclick="calculateBMI()">Calculate BMI</button>
              <div id="result"></div>
            </div>
          </div>

          <script>
            function calculateBMI() {
              const weight = parseFloat(
                document.getElementById("weight").value
              );
              const height = parseFloat(
                document.getElementById("height").value
              );
              const gender = document.getElementById("gender").value;

              if (isNaN(weight) || isNaN(height)) {
                alert("Please enter valid weight and height.");
                return;
              }

              const heightInMeters = height / 100;
              const bmi = weight / (heightInMeters * heightInMeters);

              let status = "";

              if (bmi < 18.5) {
                status = "Underweight";
              } else if (bmi >= 18.5 && bmi < 24.9) {
                status = "Normal weight";
              } else if (bmi >= 25 && bmi < 29.9) {
                status = "Overweight";
              } else {
                status = "Obese";
              }

              document.getElementById("result").innerHTML =
                "Your BMI is" + bmi.toFixed(2) + status;
            }
          </script>
        </body>
      </html>
    `
  );
});

app.get("/not-authorized", async (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Not Authorized</title>
        <link
          href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css"
          rel="stylesheet"
        />
      </head>
      <body class="bg-gray-100 flex items-center justify-center h-screen">
        <div class="bg-white p-8 rounded-lg shadow-md text-center">
          <h1 class="text-4xl font-bold text-red-600 mb-4">
            403 - Not Authorized
          </h1>
          <p class="text-lg text-gray-700 mb-6">
            You do not have permission to view this page.
          </p>
          <a
            href="/"
            class="text-white bg-blue-500 hover:bg-blue-700 font-semibold py-2 px-4 rounded"
          >
            Go to Home
          </a>
        </div>
      </body>
    </html>
  `);
});

console.log(`Server is running at url: http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
