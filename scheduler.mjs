import fetch from 'node-fetch'
import notifier from 'node-notifier'
import open from 'open'
import prompts from 'prompts'

class Scheduler {
    constructor (username, password) {
        this.username = username
        this.password = password

        this.cookie = ''
        this.profileId = ''
        this.availability = []  // Stores general availability info as [{ name: SITE_NAME, id: SITE_ID, nextAvailableTime: DATE }]
        this.appointmentId = null

        this.notifier = new notifier.NotificationCenter()
        const self = this
        this.notifier.on('click', () => {
            console.log(`Oppening Appointment: ${self.appointmentId}`)
            if (self.appointmentId) {
                open(self.getAppointmentLink(self.appointmentId))
            } else {
                open('https://app.beacontesting.com/')
            }
        })
    }

    static async start (username, password) {
        const s = new Scheduler(username, password)
        await s.login()
        return s
    }

    async pingGraphql (data = {}) {
        // Default options are marked with *
        const url = 'https://app.beacontesting.com/graphql/'
        const response = await fetch(url, {
            method: 'POST', // *GET, POST, PUT, DELETE, etc.
            mode: 'cors', // no-cors, *cors, same-origin
            cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
            credentials: 'same-origin', // include, *same-origin, omit
            headers: {
            'Content-Type': 'application/json',
            'Cookie': this.cookie,
            // 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
            // 'Content-Type': 'application/x-www-form-urlencoded',
            },
            redirect: 'follow', // manual, *follow, error
            referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
            body: JSON.stringify(data) // body data type must match "Content-Type" header
        });
        return response; // parses JSON response into native JavaScript objects
    }

    async login () {
        const res = await this.pingGraphql({"operationName":"Login","variables":{"password":this.password,"emailOrPhone":this.username},"query":"mutation Login($emailOrPhone: String!, $password: String!) {\n  login(input: {emailOrPhone: $emailOrPhone, password: $password})\n}\n"})
        if (res.ok) {
            const cookies = res.headers.get('set-cookie')
            const sessionidCookie = cookies.match(/(sessionid=[a-zA-Z0-9_]*;)/gi)[0]
            const csrfCookie = cookies.match(/(csrftoken=[a-zA-Z0-9_]*;)/gi)[0]
            this.cookie = [sessionidCookie, csrfCookie].join(' ')
            await this.getProfile()
            console.log(`Logged In - User Id: ${this.profileId}   Cookie: ${this.cookie}`)
        } else {
            throw 'Login failed'
        }
    }

    async getProfile () {
        const res = await this.pingGraphql({"operationName":"GetMyData","variables":{},"query":"query GetMyData {\n  me {\n    id\n    email\n    mobilePhone\n    organizationsAdminned {\n      id\n      name\n      __typename\n    }\n    email\n    mobilePhone\n    primaryProfileId\n    profiles {\n      id\n      firstName\n      middleName\n      lastName\n      isComplete\n      hipaaConsented\n      organization {\n        id\n        name\n        contactEmail\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n"})
        const json = await res.json()
        this.profileId = json.data.me.primaryProfileId
    }

    async getAvailability () {
        const profileId = this.profileId
        const res = await this.pingGraphql({"operationName":"AppointmentScheduleNewData","variables":{"id":profileId},"query":"query AppointmentScheduleNewData($id: ID!) {\n  myProfile(id: $id) {\n    organization {\n      id\n      name\n      __typename\n    }\n    testingSites {\n      id\n      name\n      timeZone\n      siteType\n      address {\n        street\n        street2\n        city\n        state\n        zipCode\n        latitude\n        longitude\n        __typename\n      }\n      phone\n      nextAvailableTime\n      isAcceptingAppointments\n      schedulingInstructions\n      additionalTestSiteDetails\n      testSampleCollectionInstructions\n      testKitPickupInstructions\n      testKitDropoffInstructions\n      tooltip\n      __typename\n    }\n    __typename\n  }\n}\n"})
        const json = await res.json()
        const availability = json.data.myProfile.testingSites
        const availableSites = []
        const sites = []
        for (const site of availability) {
            let { name, id, nextAvailableTime: nextTime } = site
            sites.push({ name, id })
            if (nextTime == null) {
                continue
            }
            nextTime = new Date(nextTime)
            availableSites.push({ name, nextTime, id })
        }
        this.availability = availableSites
        this.sites = sites
    }

    async getSiteAvailableDates (siteId) {
        const profileId = this.profileId
        const res = await this.pingGraphql({"operationName":"AppointmentScheduleNewAvailableDates","variables":{"id":siteId,"profileId":profileId},"query":"query AppointmentScheduleNewAvailableDates($id: ID!, $profileId: ID!) {\n  userTestingSite(id: $id, profileId: $profileId) {\n    id\n    availableDates\n    siteType\n    __typename\n  }\n}\n"})
        const json = await res.json()
        // console.log("Dates Object:", json.data)
        const rawDates = json.data.userTestingSite.availableDates
        const dates = rawDates.map(date => new Date(date))
        return dates  // Stored as [obj Date, obj Date, ...]
    }

    async getSiteAvailableTimes (siteId, date) {
        const profileId = this.profileId
        const dateString = date.toISOString()
        const res = await this.pingGraphql({"operationName":"AppointmentScheduleNewTimeSlots","variables":{"id":siteId,"profileId":profileId,"date":dateString},"query":"query AppointmentScheduleNewTimeSlots($id: ID!, $profileId: ID!, $date: Date!) {\n  userTestingSite(id: $id, profileId: $profileId) {\n    id\n    timeSlots(date: $date) {\n      id\n      startAt\n      __typename\n    }\n    __typename\n  }\n}\n"})
        const json = await res.json()
        const rawTimeslots = json.data.userTestingSite.timeSlots
        const timeslots = rawTimeslots.map(slot => ({ id: slot.id, start: new Date(slot.startAt) }))
        return timeslots  // Stored as [{ id: TIMESLOT_ID, start: obj Date(SLOT_START_DATE) }]
    }

    async createAppointment (timeslotId) {
        const profileId = this.profileId
        const res = await this.pingGraphql({"operationName":"CreateAppointment","variables":{"profileId":profileId,"timeSlotId":timeslotId},"query":"mutation CreateAppointment($profileId: ID!, $timeSlotId: ID!) {\n  createAppointment(profileId: $profileId, timeSlotId: $timeSlotId) {\n    id\n    __typename\n  }\n}\n"})
        const json = await res.json()
        const appointmentId = json.data.createAppointment.id
        return appointmentId
    }

    getAppointmentLink (appointmentId) {
        return `https://app.beacontesting.com/appointment/${appointmentId}`
    }

    // async getAppointmentInfo (appointmentId) {
    //     const profileId = this.profileId
    //     const res = await this.pingGraphql({"operationName":"AppointmentShowData","variables":{"profileId":profileId,"id":appointmentId},"query":"query AppointmentShowData($id: ID!, $profileId: ID!) {\n  appointment(id: $id, profileId: $profileId) {\n    id\n    checkedInAt\n    completedAt\n    pickedUpAt\n    patient {\n      id\n      firstName\n      lastName\n      dob\n      sex\n      race\n      ethnicity\n      externalId\n      contactPhone\n      group {\n        id\n        name\n        __typename\n      }\n      address {\n        street\n        street2\n        city\n        state\n        zipCode\n        __typename\n      }\n      organization {\n        id\n        name\n        contactEmail\n        address {\n          street\n          street2\n          city\n          state\n          zipCode\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    order {\n      id\n      collectedAt\n      __typename\n    }\n    timeSlot {\n      id\n      startAt\n      testingSite {\n        id\n        name\n        email\n        phone\n        siteType\n        address {\n          street\n          city\n          state\n          zipCode\n          latitude\n          longitude\n          __typename\n        }\n        timeZone\n        additionalInfo\n        additionalTestSiteDetails\n        testSampleCollectionInstructions\n        testKitPickupInstructions\n        testKitDropoffInstructions\n        appointmentAlerts {\n          id\n          variant\n          primaryText\n          secondaryText\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n"})
    //     const json = await res.json()
    //     const appointment = json.data.appointment

    // }

    async scheduleAppointment (startDate, endDate, locations) {
        this.notifier.notify({ title: 'Covid Test Scheduler', message: 'Started scheduling loop'})
        const self = this
        let lastFailed = false
        let hasAppointment = false
        await self.getAvailability()
        async function checkSlots () {
            try {
                for (const { id: siteId, name: siteName } of self.sites) {
                    if (locations) {
                        let valid = false
                        for (const location of locations) {
                            if (siteName.includes(location)) {
                                valid = true
                            }
                        }
                        if (!valid) {
                            continue
                        }
                    }
                    console.log('Checking for appointments at:', siteName)
                    const availableDates = await self.getSiteAvailableDates(siteId)
                    console.log('Has availabilities on dates:', availableDates)
                    for (const date of availableDates) {
                        if ((startDate != null && date < startDate) || (endDate != null && date > endDate)) {
                            continue
                        }
                        const availableTimes = await self.getSiteAvailableTimes(siteId, date)
                        if (availableTimes.length < 1) {
                            continue
                        }
                        console.log('Found available appointment:', availableTimes[0])
                        const { id: timeslotId, start: timeslotStart } = availableTimes[0]
                        const appointmentId = await self.createAppointment(timeslotId)
                        this.appointmentId = appointmentId
                        const appointmentLink = self.getAppointmentLink(appointmentId)
                        console.log("Got appointment:", appointmentLink, 'at', timeslotStart)
                        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                        self.notifier.notify({
                            title: 'Appointment Scheduled',
                            message: `New appointment at ${siteName}\nTime: ${timeslotStart.toLocaleDateString("en-US", options)}`
                        })
                        hasAppointment = true
                        break
                    }
                }
                console.log('\n\n')
            } catch (err) {
                console.log('Failed to get appointments:', err)
                if (lastFailed) {
                    hasAppointment = true
                }
                lastFailed = true
            }
            if (!hasAppointment) {
                const sleepTime = Math.random() * 10*1000 + 12*1000
                console.log(`Sleeping for ${sleepTime/1000}`)
                setTimeout(checkSlots, sleepTime)
            }
        }
        checkSlots()
    }
}

async function main() {
    const prompt = [
        { type: 'text', name: 'username', message: 'What is your email/phone number?' },
        { type: 'password', name: 'password', message: 'What is your password?' },
        { type: 'date', name: 'startDate', mask: 'YYYY-MM-DD', message: 'What is the first day you can take the test?' },
        { type: 'date', name: 'endDate', mask: 'YYYY-MM-DD', message: 'What is the last day you can take the test?' },
        { type: 'list', name: 'locations', message: 'Which locations can you use? (Comma separated list. Blank for all.)'}
    ]
    const res = await prompts(prompt)

    res.startDate.setHours(0, 0, 0, 0)
    res.endDate.setDate(res.endDate.getDate() + 1)
    res.endDate.setHours(0, 0, 0, 0)
    if (res.locations[0].length == 0) {
        res.locations = null
    }

    const s =  await Scheduler.start(res.username, res.password)
    console.log("Start:", res.startDate, "   End:", res.endDate)
    s.scheduleAppointment(res.startDate, res.endDate, res.locations)
}

main()