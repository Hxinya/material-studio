package com.materialstudio.health;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class HealthControllerTest {
    @Test
    void databaseFailureReturnsUnavailableWithoutLeakingInternalDetails() throws Exception {
        var mapper = mock(ApplicationMetadataMapper.class);
        when(mapper.findSchemaVersion()).thenThrow(new DataAccessResourceFailureException("private database details"));

        MockMvcBuilders.standaloneSetup(new HealthController(mapper)).build()
                .perform(get("/api/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("DOWN"))
                .andExpect(jsonPath("$.database").value("DOWN"))
                .andExpect(jsonPath("$.message").doesNotExist());
    }

    @Test
    void missingInitializationRecordIsNotReportedAsHealthy() throws Exception {
        var mapper = mock(ApplicationMetadataMapper.class);

        MockMvcBuilders.standaloneSetup(new HealthController(mapper)).build()
                .perform(get("/api/health"))
                .andExpect(status().isServiceUnavailable());
    }
}
