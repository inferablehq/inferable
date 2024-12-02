import { Inferable } from 'inferable'

const API_SECRET = process.env.INFERABLE_TEST_API_SECRET

const machineId = `load-test-${Math.floor(Math.random() * 1000000)}`

const client = new Inferable({
  apiSecret: API_SECRET,
  machineId,
})

client.default.register({
  func: (_, context) => {
    console.log("Handling request", context)
    return {
      word: "needle"
    }
  },
  name: "searchHaystack",
})

client.default.start().then(() => {
  console.log("Machine started", {
    machineId
  })
})
