// @refresh reload
import { Suspense } from 'solid-js'
import {
  Body,
  FileRoutes,
  Head,
  Html,
  Meta,
  Routes,
  Scripts,
  Title,
} from 'solid-start'
import { RelayEnvironmentProvider } from 'solid-relay'
import { createEnvironment } from './RelayEnvironment'

export default function Root() {
  return (
    <Html lang="en">
      <Head>
        <Title>SolidStart - Bare</Title>
        <Meta charset="utf-8" />
        <Meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Body>
        <RelayEnvironmentProvider environment={createEnvironment()}>
          <Suspense fallback="Loading...">
            <Routes>
              <FileRoutes />
            </Routes>
          </Suspense>
        </RelayEnvironmentProvider>
        <Scripts />
      </Body>
    </Html>
  )
}
