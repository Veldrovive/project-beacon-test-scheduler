# Project Beacon Covid Test Scheduler
Bypasses the [website](https://app.beacontesting.com/) and uses the project beacon api to search for and schedule an covid test. This does not magically make appointements appear, it simply waits for one to come up and then quickly books it for you so you don't lose out.

## Usage
Clone the repository with `git clone https://github.com/Veldrovive/project-beacon-test-scheduler`

Navigate into the directory with `cd project-beacon-test-scheduler`

Install [node and npm](https://nodejs.org/en/download/).

Install dependencies with `npm install`.

Run the app with `npm start`.

Enter the following information:
* Email: The email or phone number you used to sign up for Project Beacon.
* Password: The password you used to sign up for project beacon.
* Start Date: The first day you are available for the test.
* End Date: The last day you are available for the test.
* Locations: The locations that you can get to for the test.
