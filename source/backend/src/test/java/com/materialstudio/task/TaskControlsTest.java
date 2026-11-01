package com.materialstudio.task;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import com.materialstudio.catalog.CatalogService;
import com.materialstudio.catalog.TemplateView;
import com.materialstudio.common.ApiException;
import com.materialstudio.material.MaterialMapper;
import com.materialstudio.material.MaterialStorage;
import java.util.List;
import org.junit.jupiter.api.Test;

class TaskControlsTest {
    @Test void disabledSimulationControlsRejectOverridesBeforeWritingAnyTaskOrFile() {
        var catalog = mock(CatalogService.class);
        when(catalog.template("paper-postcard")).thenReturn(mock(TemplateView.class));
        var mapper = mock(TaskMapper.class); var materials = mock(MaterialMapper.class);
        var files = mock(TaskFiles.class); var materialFiles = mock(MaterialStorage.class);
        var service = new TaskService(mapper, materials, materialFiles, files, catalog, new TaskSettings(0, 0, 0, false, false, 300));
        var request = new TaskRequest("paper-postcard", List.of(), new TaskRequest.Simulation(0, 0, 0, TaskStage.MATERIAL_CHECK));
        assertThatThrownBy(() -> service.submit(1, request)).isInstanceOfSatisfying(ApiException.class,
                exception -> org.assertj.core.api.Assertions.assertThat(exception.code()).isEqualTo("SIMULATION_CONTROLS_DISABLED"));
        verifyNoInteractions(mapper, materials, materialFiles, files);
    }
}
