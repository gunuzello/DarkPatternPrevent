package com.baromi.backend.shop;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ShopController.class)
@Import(ShopController.class)
class ShopControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ShopRepository shops;

    @Test
    void ownerCanListTheirShopsWithBoundedLimit() throws Exception {
        var owner = "owner-1";
        var shop = new ShopEntity("shop-list", "https://shop.example", ShopController.ownerHashForApi(owner), Instant.now());
        when(shops.findByOwnerHashOrderByConsentAtDesc(eq(ShopController.ownerHashForApi(owner)), any())).thenReturn(List.of(shop));

        mvc.perform(get("/api/v1/shops?limit=10").header("X-Baromi-Owner", owner))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.limit").value(10))
            .andExpect(jsonPath("$.shops[0].shopId").value("shop-list"));
    }
}
