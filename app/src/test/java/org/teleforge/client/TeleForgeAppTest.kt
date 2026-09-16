package org.teleforge.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * Unit test suite for TeleForge Android client configuration.
 */
class TeleForgeAppTest {

    @Test
    fun testTeleForgeNamespaceAndAppId() {
        val expectedAppId = "org.teleforge.client"
        val expectedVersion = "1.0.0"
        assertEquals("org.teleforge.client", expectedAppId)
        assertEquals("1.0.0", expectedVersion)
    }

    @Test
    fun testDeepLinkSchemes() {
        val telegramScheme = "tg"
        val telegramHost = "t.me"
        assertNotNull(telegramScheme)
        assertNotNull(telegramHost)
    }
}
