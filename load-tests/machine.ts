import { Inferable } from 'inferable'

const API_SECRET = process.env.INFERABLE_TEST_API_SECRET

const client = new Inferable({
  apiSecret: API_SECRET,
})

client.default.register({
  func: () => {
    return {
      word: "needle"
    }
  },
  name: "searchHaystack",
})

client.default.start()
