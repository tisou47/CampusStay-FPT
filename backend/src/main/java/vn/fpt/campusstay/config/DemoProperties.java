package vn.fpt.campusstay.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code campusstay.demo.*}: the demo server's tools (spec §15).
 *
 * @param tools {@code DEMO_TOOLS=true}: the Admin may replace the business data by a demo stage (Admin › System)
 */
@ConfigurationProperties("campusstay.demo")
public record DemoProperties(boolean tools) {
}
