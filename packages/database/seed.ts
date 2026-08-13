#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding development data...')
  const admin = await prisma.user.upsert({
    where: { email: 'admin@takeprop.test' },
    update: {},
    create: {
      email: 'admin@takeprop.test',
      password: 'dev-password',
      firstName: 'Admin',
      lastName: 'User'
    }
  })
  console.log('Created admin:', admin.email)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
